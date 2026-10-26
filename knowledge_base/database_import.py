"""Private, preview-first JSON/CSV imports into native Atlas databases.

No Drive requests, automatic grouping, or updates to pre-existing records.
"""
from contextlib import closing
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import time
from urllib.parse import urlparse, parse_qs
import uuid

from flask import jsonify, request
from database_api import LOCK, now, validate
from database_import_profiles import inventory_profile, BOOKS_PROFILE

MAX_BYTES = 8 * 1024 * 1024
MAX_ROWS = 5000
IMPORT_TYPES = ('text', 'number', 'select', 'multi_select', 'status', 'date', 'checkbox', 'url', 'email', 'phone')


def pointer(value, path):
    if path == '':
        return value
    if not isinstance(path, str) or not path.startswith('/'):
        raise ValueError('La ruta debe ser un JSON Pointer (por ejemplo /inventario/libros)')
    for part in path[1:].split('/'):
        part = part.replace('~1', '/').replace('~0', '~')
        if isinstance(value, dict):
            if part not in value:
                return None
            value = value[part]
        else:
            return None
    return value


def escape(key):
    return key.replace('~', '~0').replace('/', '~1')


def collections(value, path='', depth=0):
    if depth > 20:
        raise ValueError('El JSON supera 20 niveles de profundidad')
    if isinstance(value, list):
        # Never explode nested arrays or merge candidate groups.
        if value and all(isinstance(row, dict) for row in value):
            return [dict(path=path, count=len(value))]
        return []
    result = []
    if isinstance(value, dict):
        for key, item in value.items():
            result.extend(collections(item, path + '/' + escape(key), depth + 1))
    return result


def fields(rows):
    found = {}
    def visit(obj, path='', depth=0):
        if depth > 20:
            raise ValueError('Un registro supera 20 niveles de profundidad')
        for key, value in obj.items():
            p = path + '/' + escape(key)
            if isinstance(value, dict) and value:
                visit(value, p, depth + 1)
            else:
                found[p] = dict(path=p, name=p[1:].replace('/', ' · '))
    for row in rows:
        visit(row)
    if len(found) > 200:
        raise ValueError('Máximo 200 campos por colección')
    return list(found.values())


def parse_file(filename, content, delimiter=None):
    if not content or len(content) > MAX_BYTES:
        raise ValueError('Archivo vacío o superior a 8 MiB')
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError as exc:
        raise ValueError('Usa UTF-8 para conservar correctamente los caracteres') from exc
    extension = Path(filename).suffix.lower()
    if extension == '.json':
        def unique_keys(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError('El JSON repite una clave; corrígela antes de importar')
                result[key] = value
            return result
        try:
            data = json.loads(text, object_pairs_hook=unique_keys,
                              parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Número JSON no finito')))
        except (json.JSONDecodeError, RecursionError) as exc:
            raise ValueError('JSON inválido o excesivamente anidado') from exc
        options = collections(data)
        if not options:
            raise ValueError('No se encontró una lista no vacía de objetos. No se aplanan grupos automáticamente')
    elif extension == '.csv':
        if delimiter not in (None, '', ',', ';', '\t'):
            raise ValueError('Separador CSV no válido')
        if not delimiter:
            try:
                delimiter = csv.Sniffer().sniff(text[:8192], delimiters=',;\t').delimiter
            except csv.Error:
                delimiter = ','
        try:
            reader = csv.reader(io.StringIO(text, newline=''), delimiter=delimiter, strict=True)
            header = next(reader)
            if not header or any(not name.strip() for name in header) or len(set(header)) != len(header):
                raise ValueError('CSV requiere encabezados únicos y no vacíos')
            data = []
            for line, values in enumerate(reader, 2):
                if not values:
                    continue
                if len(values) != len(header):
                    raise ValueError(f'CSV: número de celdas incorrecto en la línea {line}')
                data.append(dict(zip(header, values)))
                if len(data) > MAX_ROWS:
                    raise ValueError('Máximo 5000 registros por importación')
            if not data:
                raise ValueError('CSV sin registros')
        except (csv.Error, StopIteration) as exc:
            raise ValueError('CSV inválido') from exc
        options = [dict(path='', count=len(data))]
    else:
        raise ValueError('Selecciona un archivo .json o .csv')
    profile = inventory_profile(data) if extension == '.json' else None
    if profile:
        options = [dict(path=profile['collection'], count=len(data['archivos']))]
    return dict(data=data, collections=options, profile=profile, delimiter=delimiter, text=text, bom=content.startswith(b'\xef\xbb\xbf'), format=extension[1:])


def drive_id(value):
    if not isinstance(value, str):
        raise ValueError('El ID de Drive debe ser texto; los IDs numéricos pierden ceros')
    value = value.strip()
    if value.startswith(('https://', 'http://')):
        u = urlparse(value)
        if u.hostname not in ('drive.google.com', 'docs.google.com'):
            raise ValueError('El enlace no pertenece a Drive')
        match = re.search(r'/d/([A-Za-z0-9_-]+)', u.path)
        value = match.group(1) if match else parse_qs(u.query).get('id', [''])[0]
    if not re.fullmatch(r'[A-Za-z0-9_-]{10,200}', value):
        raise ValueError('ID de Drive no válido (se conserva el original para revisión)')
    return value


def converted(kind, value):
    if value is None or value == '':
        return validate(kind, None)
    if kind in ('text', 'select', 'status'):
        value = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    elif kind == 'number':
        if isinstance(value, bool):
            raise ValueError('Una casilla no es un número')
        if isinstance(value, str):
            if not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', value.strip()):
                raise ValueError('Número inválido: usa punto decimal, sin separadores de miles')
            value = float(value)
        if not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError('Número no finito')
    elif kind == 'checkbox' and isinstance(value, str):
        choices = {'true': True, 'false': False, '1': True, '0': False, 'sí': True, 'si': True, 'no': False}
        if value.strip().lower() not in choices:
            raise ValueError('Casilla inválida: true/false, sí/no o 1/0')
        value = choices[value.strip().lower()]
    elif kind == 'multi_select' and isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError('Multiselección requiere un array JSON, no una separación inferida') from exc
    return validate(kind, value)


def register_database_import(app, g, ctx):
    def folder():
        result = g['DATA_DIR'] / 'database_imports'
        result.mkdir(parents=True, exist_ok=True, mode=0o700)
        return result

    def private_json(path, value):
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with path.open('x', encoding='utf-8') as out:
            path.chmod(0o600)
            json.dump(value, out, ensure_ascii=False)
            out.flush()
            os.fsync(out.fileno())

    def payload():
        value = request.get_json()
        if not isinstance(value, dict):
            raise ValueError('Se requiere un objeto JSON de configuración')
        return value

    def load_preview(token):
        if not re.fullmatch(r'[a-f0-9]{32}', str(token)):
            raise ValueError('Vista previa no válida')
        path = folder() / (token + '.json')
        if not path.is_file():
            raise ValueError('La vista previa no existe; selecciona el archivo de nuevo')
        preview = json.loads(path.read_text())
        if time.time() - preview['created'] > 86400:
            raise ValueError('Vista previa caducada; selecciona el archivo de nuevo')
        return preview

    def selected(preview, path):
        if path not in {c['path'] for c in preview['collections']}:
            raise ValueError('Selecciona explícitamente una colección disponible')
        rows = pointer(preview['data'], path)
        if len(rows) > MAX_ROWS:
            raise ValueError('Máximo 5000 registros por colección; divide el archivo antes de importar')
        return rows

    def build(preview, data, index):
        rows = selected(preview, data.get('collection'))
        profile = preview.get('profile')
        if profile and (data.get('title_field') != profile['title_field'] or data.get('identity_field') != profile['identity_field']):
            raise ValueError('Este perfil conserva el título provisional y drive_id como identidad; no sustituir por grupos o autoría')
        available = {f['path'] for f in fields(rows)}
        title_field, id_field = data.get('title_field'), data.get('identity_field')
        if title_field not in available or id_field not in available:
            raise ValueError('Selecciona los campos de título e ID de Drive')
        mappings = data.get('columns')
        if not isinstance(mappings, list) or not mappings or len(mappings) > 200 or any(not isinstance(m, dict) for m in mappings):
            raise ValueError('Asigna entre 1 y 200 columnas')
        target = data.get('target')
        if target:
            if not isinstance(target, dict):
                raise ValueError('Destino no válido')
            parent, source_id = target.get('parent'), target.get('database_id')
            if index.get(parent, {}).get('database_locked') or index.get(parent, {}).get('database_deleted'):
                raise ValueError('La página de destino está bloqueada o en papelera')
            schema = ctx['source'](parent, source_id, index)[4]
        else:
            schema = dict(columns=[], views=[dict(id='import_table', name='Tabla', type='table')], activeView='import_table', identity_version=1)
        columns, names, ids = [], set(), set()
        for m in mappings:
            if m.get('field') not in available or m.get('type') not in IMPORT_TYPES:
                raise ValueError('Campo o tipo de columna no válido')
            name = str(m.get('name', '')).strip()
            if not name or len(name) > 100 or name.casefold() in names:
                raise ValueError('Los nombres de columnas deben ser únicos y no vacíos (máximo 100 caracteres)')
            names.add(name.casefold())
            if target:
                col = next((c for c in schema['columns'] if c['id'] == m.get('target_column')), None)
                if not col or col['type'] != m['type']:
                    raise ValueError('Asigna cada campo a una columna existente del mismo tipo; no se cambia el esquema existente')
            else:
                col = dict(id='import_' + hashlib.sha256(m['field'].encode()).hexdigest()[:16], name=name, type=m['type'])
            if col['id'] in ids:
                raise ValueError('Dos campos no pueden escribir la misma columna')
            ids.add(col['id']); columns.append((m['field'], col))
        if not any(field == id_field and col['type'] in ('text', 'url') for field, col in columns):
            raise ValueError('Conserva el campo de ID de Drive como columna para detectar también registros existentes')
        existing = {}
        if target:
            mapped_identity = next((c['id'] for f, c in columns if f == id_field), None)
            for key, meta in index.items():
                if meta.get('parent_id') != parent or meta.get('database_id') != source_id:
                    continue
                origin = meta.get('import_identity')
                identity = origin.get('drive_id') if isinstance(origin, dict) else None
                if not identity and mapped_identity:
                    val = next((p.get('value') for p in meta.get('properties', []) if p.get('id') == mapped_identity), None)
                    try:
                        identity = drive_id(val)
                    except ValueError:
                        pass
                if identity:
                    existing.setdefault(identity, (key, bool(meta.get('database_deleted'))))
        results, seen, ready = [], {}, []
        for number, row in enumerate(rows, 1):
            outcome = dict(row=number)
            try:
                identity = drive_id(pointer(row, id_field))
                outcome['drive_id'] = identity
                if identity in existing:
                    record, deleted = existing[identity]
                    outcome.update(status='duplicate_in_trash' if deleted else 'duplicate_existing', record_id=record)
                elif identity in seen:
                    outcome.update(status='duplicate_in_file', first_row=seen[identity])
                else:
                    title = pointer(row, title_field)
                    if not isinstance(title, str) or not title.strip() or len(title) > 500:
                        raise ValueError('Título vacío, no textual o superior a 500 caracteres')
                    values = {}
                    for field, col in columns:
                        try:
                            values[col['id']] = converted(col['type'], pointer(row, field))
                        except (ValueError, TypeError, OverflowError) as exc:
                            raise ValueError(f"{col['name']} ({field}): {exc}") from exc
                    if target:
                        for _, col in columns:
                            ctx['checked_cell'](index, {}, col, values[col['id']])
                    outcome['status'] = 'ready'
                    ready.append(dict(row=number, identity=identity, title=title.strip(), values=values, raw=row))
                    seen[identity] = number
            except (ValueError, TypeError, OverflowError) as exc:
                outcome.update(status='invalid', error=str(exc))
            results.append(outcome)
        if not target:
            if profile:
                schema['titleName'] = 'Título provisional · nombre de archivo'
                schema['import_profile'] = profile['id']
            schema['columns'] = [col for _, col in columns]
            for col in schema['columns']:
                if col['type'] in ('select', 'multi_select', 'status'):
                    labels = []
                    for row in ready:
                        value = row['values'][col['id']]
                        for label in value if isinstance(value, list) else [value] if value else []:
                            if label not in labels:
                                labels.append(label)
                    col['options'] = [dict(label=label, color='#888888') for label in labels]
        return schema, ready, results

    def summary(results):
        return {status: sum(r['status'] == status for r in results) for status in ('ready', 'created', 'duplicate_existing', 'duplicate_in_file', 'duplicate_in_trash', 'invalid')}

    def receipts(conn):
        conn.execute('CREATE TABLE IF NOT EXISTS database_import_receipts (fingerprint TEXT PRIMARY KEY, report TEXT NOT NULL)')

    def fingerprint(preview, data):
        return hashlib.sha256(json.dumps(dict(hash=preview['sha256'], config={k: data.get(k) for k in ('collection', 'columns', 'title_field', 'identity_field', 'target', 'name')}), sort_keys=True, ensure_ascii=False).encode()).hexdigest()

    def recover(conn):
        """Only remove exact uncommitted files created by this importer after a crash."""
        for path in folder().glob('run-*.json'):
            journal = json.loads(path.read_text())
            if journal['status'] != 'prepared':
                continue
            committed = conn.execute('SELECT 1 FROM database_import_receipts WHERE fingerprint=?', (journal['fingerprint'],)).fetchone()
            if committed:
                continue
            for item in journal['files']:
                dest = g['_entry_path'](item['id'], item['meta'])
                if conn.execute('SELECT 1 FROM entries WHERE entry_id=?', (item['id'],)).fetchone():
                    raise ValueError('Importación interrumpida con conflicto: conserva el journal para revisar')
                if dest.exists():
                    if hashlib.sha256(dest.read_bytes()).hexdigest() != item['sha256']:
                        raise ValueError('Un archivo de importación interrumpida cambió; se conserva para recuperación manual')
                    dest.unlink()
            journal['status'] = 'rolled_back'
            path.write_text(json.dumps(journal, ensure_ascii=False))

    @app.route('/api/databases/import/preview', methods=['POST'])
    def import_preview():
        try:
            uploaded = request.files.get('file')
            if not uploaded:
                raise ValueError('Selecciona un archivo JSON o CSV')
            content = uploaded.read(MAX_BYTES + 1)
            parsed = parse_file(uploaded.filename or '', content, request.form.get('delimiter'))
            token = uuid.uuid4().hex
            preview = dict(parsed, created=time.time(), filename=Path(uploaded.filename).name,
                           sha256=hashlib.sha256(content).hexdigest())
            private_json(folder() / (token + '.json'), preview)
            return jsonify(token=token, collections=parsed['collections'], profile=parsed['profile'], format=parsed['format'], delimiter=parsed['delimiter'],
                           warning='Selecciona la colección explícitamente. Objetos y grupos no se fusionan; los datos originales se conservan privados.')
        except (ValueError, TypeError, RecursionError) as exc:
            return jsonify(error=str(exc)), 400

    @app.route('/api/databases/import/inspect', methods=['POST'])
    def import_inspect():
        try:
            data = payload(); preview = load_preview(data.get('token'))
            rows = selected(preview, data.get('collection'))
            return jsonify(fields=fields(rows), sample=rows[:5], count=len(rows), profile=preview.get('profile'))
        except (ValueError, TypeError) as exc:
            return jsonify(error=str(exc)), 400

    @app.route('/api/databases/import/validate', methods=['POST'])
    def import_validate():
        try:
            data = payload(); preview = load_preview(data.get('token'))
            with LOCK, closing(ctx['connect']()) as conn:
                conn.execute('BEGIN IMMEDIATE')
                _, _, results = build(preview, data, ctx['read'](conn))
            return jsonify(rows=results, counts=summary(results), fingerprint=fingerprint(preview, data))
        except (ValueError, TypeError, KeyError, FileNotFoundError) as exc:
            return jsonify(error=str(exc)), 400

    @app.route('/api/databases/import/apply', methods=['POST'])
    def import_apply():
        written = []
        try:
            data = payload(); preview = load_preview(data.get('token'))
            signature = fingerprint(preview, data)
            if data.get('confirmation') != signature:
                raise ValueError('Valida esta asignación y confirma su vista previa antes de importar')
            with LOCK, closing(ctx['connect']()) as conn:
                conn.execute('BEGIN IMMEDIATE'); receipts(conn); recover(conn)
                prior = conn.execute('SELECT report FROM database_import_receipts WHERE fingerprint=?', (signature,)).fetchone()
                if prior:
                    return jsonify(**json.loads(prior[0]), replay=True)
                index = ctx['read'](conn); schema, ready, results = build(preview, data, index)
                if any(row['status'] == 'invalid' for row in results):
                    return jsonify(error='Corrige las filas inválidas: no se ha creado ni modificado ningún registro', rows=results, counts=summary(results)), 422
                target = data.get('target')
                files = []
                if target:
                    parent, source_id = target['parent'], target['database_id']
                else:
                    name = str(data.get('name', '')).strip()
                    if not name or len(name) > 200:
                        raise ValueError('Nombre de base obligatorio (máximo 200 caracteres)')
                    parent, source_id = 'import-'+uuid.uuid4().hex, 'db_'+uuid.uuid4().hex
                    schema.update(database_id=source_id, name=name)
                    meta = dict(type='page', title=name, uid=uuid.uuid4().hex[:8], parent_id=None, db_row=False,
                                created_at=now(), updated_at=now(), status='pendiente', tags=[], properties=[], order=len(index))
                    if parent in index:
                        raise ValueError('Identificador ya existente; no se sobrescribe nada')
                    files.append(dict(id=parent, meta=meta, content=':::database\n'+json.dumps(schema, ensure_ascii=False)+'\n:::\n'))
                order = max((m.get('order', 0) for m in index.values() if m.get('parent_id') == parent), default=-1) + 1
                for offset, row in enumerate(ready):
                    key = 'record-'+uuid.uuid4().hex
                    if key in index:
                        raise ValueError('Identificador ya existente; no se sobrescribe nada')
                    meta = dict(type='page', title=row['title'], uid=uuid.uuid4().hex[:8], db_row=True, parent_id=parent, database_id=source_id,
                                created_at=now(), updated_at=now(), created_by='owner', edited_by='owner', status='pendiente', tags=[], icon='', order=order+offset,
                                properties=[dict(id=c['id'], name=c['name'], type=c['type'], value=row['values'][c['id']]) for c in schema['columns'] if c['id'] in row['values']],
                                import_identity=dict(drive_id=row['identity'], source_hash=preview['sha256']), import_original=row['raw'])
                    files.append(dict(id=key, meta=meta, content=''))
                    results[row['row']-1].update(status='created', record_id=key)
                run = uuid.uuid4().hex
                journal = dict(status='prepared', fingerprint=signature, files=[dict(id=f['id'], meta=f['meta'], sha256=hashlib.sha256(f['content'].encode()).hexdigest()) for f in files])
                private_json(folder() / ('run-'+run+'.json'), journal)
                archive = folder() / ('source-'+preview['sha256']+'.'+preview['format'])
                if not archive.exists():
                    try:
                        with archive.open('xb') as out:
                            archive.chmod(0o600); out.write((b'\xef\xbb\xbf' if preview.get('bom') else b'') + preview['text'].encode()); out.flush(); os.fsync(out.fileno())
                    except OSError:
                        archive.unlink(missing_ok=True)
                        raise
                if hashlib.sha256(archive.read_bytes()).hexdigest() != preview['sha256']:
                    raise ValueError('El archivo privado de origen no coincide; se conserva y se bloquea la importación para revisar')
                try:
                    for item in files:
                        dest = g['_entry_path'](item['id'], item['meta']); dest.parent.mkdir(parents=True, exist_ok=True)
                        with dest.open('x', encoding='utf-8') as out:
                            written.append(dest); out.write(item['content']); out.flush(); os.fsync(out.fileno())
                        ctx['put'](conn, item['id'], item['meta'])
                    report = dict(id=run, parent_id=parent, database_id=source_id, rows=results, counts=summary(results),
                                  original_file=preview['filename'], source_hash=preview['sha256'], existing_records_unchanged=True,
                                  configuration={k: data.get(k) for k in ('collection','title_field','identity_field','columns','target','name')},
                                  profile=preview.get('profile', {}).get('id') if preview.get('profile') else None,
                                  context_counts=preview.get('profile', {}).get('context_counts') if preview.get('profile') else None)
                    conn.execute('INSERT INTO database_import_receipts VALUES(?,?)', (signature, json.dumps(report, ensure_ascii=False)))
                    conn.commit()
                except Exception:
                    conn.rollback()
                    for dest in written:
                        dest.unlink(missing_ok=True)
                    raise
                return jsonify(**report, replay=False), 201
        except (ValueError, KeyError, TypeError, FileNotFoundError) as exc:
            return jsonify(error=str(exc)), 400
        except sqlite3.Error:
            return jsonify(error='La base está ocupada o no pudo completar la transacción; conserva la vista previa y reintenta'), 503
        except OSError:
            return jsonify(error='Error de almacenamiento: se conserva la vista previa y el journal privado para recuperar o reintentar'), 507

    @app.route('/api/databases/import/reports/<report_id>')
    def import_report(report_id):
        if not re.fullmatch(r'[a-f0-9]{32}', report_id):
            return jsonify(error='Informe no encontrado'), 404
        with closing(ctx['connect']()) as conn:
            if not conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='database_import_receipts'").fetchone():
                return jsonify(error='Informe no encontrado'), 404
            for (raw,) in conn.execute('SELECT report FROM database_import_receipts'):
                report = json.loads(raw)
                if report['id'] == report_id:
                    response = jsonify(report)
                    response.headers['Content-Disposition'] = 'attachment; filename="atlas-informe-importacion.json"'
                    return response
        return jsonify(error='Informe no encontrado'), 404
