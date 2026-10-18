"""Read-only, bounded exports of one record and its explicitly included children.

The parent database is never traversed. Public remote media are fetched only when included, within strict bounds. Every
archive contains a manifest describing omissions and selected stored views.
"""
from contextlib import closing
from functools import cmp_to_key
from html import escape
from io import BytesIO, StringIO
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit
import base64
import csv
import hashlib
import json
import mimetypes
import posixpath
import re
import zipfile
import time
import math
from database_remote_assets import fetch_remote_asset, RemoteAssetError
from flask import request, jsonify, send_file
from database_identity import database_blocks
from datetime import datetime, timezone, date
from database_filters import validate_filters, match_tree, filter_today, relative_range
from database_dates import date_start
from cover_storage import cover_path

MAX_PAGES = 200
MAX_BYTES = 50 * 1024 * 1024
MAX_ASSET = 20 * 1024 * 1024


def export_options(value):
    if not isinstance(value, dict):
        raise ValueError('Opciones de exportación no válidas')
    defaults = dict(format='markdown_csv', database_view='current', include_content='all', include_subpages=False, folders=False)
    if set(value) - set(defaults):
        raise ValueError('Opción de exportación desconocida')
    result = dict(defaults, **value)
    if result['format'] not in ('markdown_csv', 'html', 'pdf', 'json') or result['database_view'] not in ('current', 'default') or result['include_content'] not in ('all', 'no_files'):
        raise ValueError('Formato, vista o contenido no válido')
    if type(result['include_subpages']) is not bool or type(result['folders']) is not bool:
        raise ValueError('Subpáginas y carpetas requieren valores booleanos')
    if result['folders'] and not result['include_subpages']:
        raise ValueError('Crear carpetas requiere incluir subpáginas')
    return result


def display(value):
    if value is None: return ''
    if isinstance(value, bool): return 'true' if value else 'false'
    if isinstance(value, list): return ', '.join(display(v) for v in value)
    if isinstance(value, dict) and set(value)=={'start','end'}: return str(value['start'])+' → '+str(value['end'])
    if isinstance(value, dict): return str(value.get('name') or json.dumps(value, ensure_ascii=False))
    return str(value)


def selected_rows(rows, view, now=None):
    """Same persisted rules as databaseModel.filteredRows; no transient search."""
    validate_filters(view)
    now = now or datetime.now(timezone.utc)
    def value(row, key):
        return row.get('title', '') if key in ('title', '__title') else next((p.get('value', '') for p in row['properties'] if p['id'] == key), '')
    def matches(row, rule):
        raw = value(row, rule.get('colId')); actual = display(raw).lower(); wanted = display(rule.get('value')).lower()
        op = rule.get('op', 'contains')
        kind=next((p.get('type') for p in row.get('properties',[]) if p.get('id')==rule.get('colId')),None)
        if kind in ('date','created_time','edited_time'):raw=date_start(raw);actual=display(raw).lower()
        if kind in ('date','created_time','edited_time') and op=='relative':
            span=relative_range(rule.get('value'),filter_today(rule.get('timeZone') or view.get('filterTimeZone') or 'UTC',now))
            day=re.match(r'^\d{4}-\d{2}-\d{2}(?=$|T)',raw) if isinstance(raw,str) else None
            try:actual_day=date.fromisoformat(day[0]) if day else None
            except ValueError:actual_day=None
            return bool(span and actual_day and span[0]<=actual_day<=span[1])
        if kind in ('date','created_time','edited_time') and re.fullmatch(r'\d{4}-\d{2}-\d{2}',str(rule.get('value',''))):
            day=re.match(r'^\d{4}-\d{2}-\d{2}(?=$|T)',raw) if isinstance(raw,str) else None
            day=day[0] if day else ''
            if op=='is':return day==wanted
            if op=='not':return day!=wanted
            if op=='gt':return bool(day) and day>wanted
            if op=='lt':return bool(day) and day<wanted
        def number(v):
            if isinstance(v,bool) or not isinstance(v,(int,float,str)):return None
            text=str(v).strip()
            if not re.fullmatch(r'[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?',text,re.I):return None
            parsed=float(text)
            return parsed if math.isfinite(parsed) else None
        av,ev=number(raw),number(rule.get('value'))
        if kind in ('number','formula','rollup') and op in ('is','not') and av is not None and ev is not None:
            return (av==ev) if op=='is' else (av!=ev)
        blank = raw is None or raw == '' or raw == []
        if op == 'empty': return blank
        if op == 'not_empty': return not blank
        if op in ('is', 'not'):
            same = rule.get('value') in raw if isinstance(raw, list) else actual == wanted
            return same if op == 'is' else not same
        if op in ('gt', 'lt'):
            return av is not None and ev is not None and (av>ev if op=='gt' else av<ev)
        if isinstance(raw,list) and kind in ('multi_select','person','relation'):return rule.get('value') in raw
        return wanted in actual
    rules = view.get('filters', [])
    rows = [r for r in rows if match_tree(rules,view.get('filterMode'),lambda rule:matches(r,rule))]
    def natural(v):
        return [(1, int(p)) if p.isdigit() else (0, p.casefold()) for p in re.split(r'(\d+)', display(v))]
    def compare(a, b):
        for sort in view.get('sorts', []):
            av, bv = date_start(value(a, sort.get('colId'))), date_start(value(b, sort.get('colId')))
            if isinstance(av, (int, float)) and not isinstance(av, bool) and isinstance(bv, (int, float)) and not isinstance(bv, bool): diff = (av > bv) - (av < bv)
            else: diff = (natural(av) > natural(bv)) - (natural(av) < natural(bv))
            if diff: return -diff if sort.get('dir') == 'desc' else diff
        return (a.get('order', 0) > b.get('order', 0)) - (a.get('order', 0) < b.get('order', 0))
    return sorted(rows, key=cmp_to_key(compare))


def view_columns(schema, view):
    by_id={c['id']:c for c in schema['columns']}
    order=view.get('columnOrder',[])
    order=order if isinstance(order,list) else []
    ids=dict.fromkeys([*[key for key in order if isinstance(key,str)],*by_id])
    return [by_id[key] for key in ids if key in by_id and key not in view.get('hidden',[])]


def safe_name(title, identifier):
    stem = re.sub(r'[^\w.-]+', '-', str(title), flags=re.UNICODE).strip(' .-')[:65] or 'Sin-titulo'
    # Full hash protects against colliding IDs that sanitize to the same name.
    suffix = hashlib.sha256(str(identifier).encode()).hexdigest()[:16]
    return stem + '-' + suffix


def code_spans(text, inline=True):
    """Offsets of literal fenced/indented/inline code; preserve original bytes.

    Database JSON is a custom block, so pretty-printed JSON indentation inside
    a real :::database wrapper is not an indented Markdown code block.
    """
    blocks = []; fence = None; start = 0; offset = 0; database = False
    for line in text.splitlines(keepends=True):
        if fence:
            if re.fullmatch(r' {0,3}' + re.escape(fence[0]) + '{' + str(len(fence)) + r',}\s*', line):
                blocks.append((start, offset + len(line))); fence = None
        elif database:
            if line.strip() == ':::': database = False
        else:
            opening = re.match(r' {0,3}(`{3,}|~{3,})([^\r\n]*)', line)
            if opening and not (opening[1][0] == '`' and '`' in opening[2]):
                fence = opening[1]; start = offset
            elif line.startswith(('    ', '\t')):
                blocks.append((offset, offset + len(line)))
            elif line.strip() == ':::database': database = True
        offset += len(line)
    if fence: blocks.append((start, len(text)))
    if not inline: return blocks
    spans = []; cursor = 0
    for left, right in blocks + [(len(text), len(text))]:
        fragment = text[cursor:left]; position = 0
        while position < len(fragment):
            opening = re.search(r'(?<!`)(`+)(?!`)', fragment[position:])
            if not opening: break
            begin = position + opening.start(); after = position + opening.end()
            prefix = fragment[:begin]
            if (len(prefix) - len(prefix.rstrip('\\'))) % 2:
                position = after; continue
            closing = re.search(r'(?<!`)' + re.escape(opening[1]) + r'(?!`)', fragment[after:])
            if closing:
                end = after + closing.end(); spans.append((cursor + begin, cursor + end)); position = end
            else: position = after
        if right > left: spans.append((left, right))
        cursor = right
    return spans


def map_outside_code(text, transform):
    chunks = []; cursor = 0
    for left, right in code_spans(text):
        chunks.extend((transform(text[cursor:left]), text[left:right])); cursor = right
    chunks.append(transform(text[cursor:]))
    return ''.join(chunks)


def mask_block_code(text):
    parts = []; cursor = 0
    for left, right in code_spans(text, inline=False):
        parts.extend((text[cursor:left], re.sub(r'[^\r\n]', ' ', text[left:right]))); cursor = right
    parts.append(text[cursor:])
    return ''.join(parts)


class RecordArchive:
    def __init__(self, g, h, index, options):
        self.g, self.h, self.index, self.options = g, h, index, options
        self.pages, self.assets, self.members, self.total = {}, {}, {}, 0
        self.gather_bytes = 0
        self.omitted_keys = set()
        self.remote_failures = set()
        self.remote_attempts = 0
        self.remote_budget = 20.0
        self.property_issue_keys=set()
        self.filter_now=datetime.now(timezone.utc)
        self.manifest = dict(filter_evaluated_at=self.filter_now.isoformat(),format='atlas.record-export.v1', options=options, scope='opened_record', pages=[], databases=[], omitted=[], property_issues=[], warnings=[])
        if options['database_view'] == 'default':
            self.manifest['warnings'].append('Atlas default view means the first saved view; equivalence with Notion is not confirmed.')

    def add(self, name, content):
        content = content.encode('utf-8') if isinstance(content, str) else content
        if self.total + len(content) > MAX_BYTES: raise ValueError('La exportación supera 50 MB')
        if name in self.members: raise ValueError('Nombre de archivo duplicado')
        self.members[name] = content; self.total += len(content)

    def gather(self, identifier, schema=None, folder='', ancestry=()):
        if identifier in ancestry: raise ValueError('Ciclo de subpáginas detectado')
        if identifier in self.pages: return
        if len(self.pages) >= MAX_PAGES: raise ValueError('Máximo 200 páginas por exportación')
        meta = self.index[identifier]
        path = self.g['_entry_path'](identifier, meta)
        if path.stat().st_size > 2 * 1024 * 1024: raise ValueError('Una página supera 2 MB')
        self.gather_bytes += path.stat().st_size
        if self.gather_bytes > MAX_BYTES: raise ValueError('El contenido supera 50 MB')
        body = path.read_text()
        row = self.h['projected'](identifier, meta, schema, self.index) if schema else dict(meta, id=identifier)
        self.note_properties(row)
        name = safe_name(meta.get('title', 'Sin título'), identifier)
        base = str(PurePosixPath(folder) / name)
        page = dict(id=identifier, row=row, body=body, base=base, children=[], databases=[])
        self.pages[identifier] = page
        self.manifest['pages'].append(dict(id=identifier, path=base, parent_id=meta.get('parent_id')))
        next_folder = base if self.options['folders'] else ''
        # Only canonical sources physically present in this record are followed.
        for start, end, raw_schema in database_blocks(mask_block_code(body)):
            source_id = raw_schema.get('database_id')
            if not source_id: raise ValueError('La página contiene una base sin identidad persistente')
            canonical = self.h['source'](identifier, source_id, self.index)[4]
            views = canonical['views']; chosen = next((v for v in views if v['id'] == canonical.get('activeView')), views[0]) if self.options['database_view'] == 'current' else views[0]
            rows = [self.h['projected'](key, m, canonical, self.index) for key, m in self.index.items() if m.get('parent_id') == identifier and m.get('database_id') == source_id and not m.get('database_deleted')]
            if len(rows) > 5000: raise ValueError('Máximo 5000 registros por base incluida')
            rows = selected_rows(rows, chosen, self.filter_now)
            for record in rows:self.note_properties(record)
            db_base = str(PurePosixPath(next_folder) / safe_name(canonical.get('name', 'Base de datos'), source_id))
            db = dict(schema=canonical, view=chosen, rows=rows, base=db_base, start=start, end=end)
            page['databases'].append(db)
            self.manifest['databases'].append(dict(parent_id=identifier, database_id=source_id, view=chosen, row_ids=[r['id'] for r in rows], path=db_base))
            if self.options['include_subpages']:
                for row in rows:
                    self.gather(row['id'], canonical, next_folder, ancestry + (identifier,))
                    page['children'].append(row['id'])
        # Ordinary descendants are independent pages, never sibling DB records.
        if self.options['include_subpages']:
            for key, child in self.index.items():
                if child.get('parent_id') == identifier and not child.get('database_id') and not child.get('database_deleted'):
                    self.gather(key, None, next_folder, ancestry + (identifier,)); page['children'].append(key)

    def relative(self, current, target):
        return posixpath.relpath(target, posixpath.dirname(current) or '.')

    def note_properties(self,row):
        for prop in row.get('properties',[]):
            details={k:prop[k] for k in ('calculation_error','relation_issues','conversion_pending') if prop.get(k)}
            if prop.get('relation_source_available') is False:details['relation_source_available']=False
            key=(row.get('id'),prop.get('id'))
            if details and key not in self.property_issue_keys:
                self.property_issue_keys.add(key)
                self.manifest['property_issues'].append(dict(entry_id=key[0],column_id=key[1],**details))

    def omitted(self, url, reason):
        key = (url, reason)
        if key not in self.omitted_keys:
            self.omitted_keys.add(key)
            self.manifest['omitted'].append(dict(url=url, reason=reason))

    def asset(self, url, current, label='archivo'):
        url = str(url)
        if self.options['include_content'] == 'no_files': return None
        try: parsed = urlsplit(url)
        except ValueError:
            self.omitted(url,'remote_url_invalid');return None
        if parsed.scheme or parsed.netloc:
            key='remote:'+url
            if key in self.assets:return self.relative(current,self.assets[key])
            if url in self.remote_failures:return None
            self.remote_failures.add(url)
            if self.remote_attempts>=20 or self.remote_budget<=0:
                self.omitted(url,'remote_budget_exceeded');return None
            self.remote_attempts+=1;start=time.monotonic()
            try:
                content,mime,resolved=fetch_remote_asset(url,min(MAX_ASSET,MAX_BYTES-self.total),timeout=min(5,self.remote_budget))
            except RemoteAssetError as error:
                self.omitted(url,str(error));return None
            finally:self.remote_budget-=time.monotonic()-start
            filename=Path(unquote(urlsplit(resolved).path)).name or label
            extension=re.sub(r'[^a-zA-Z0-9.]','',Path(filename).suffix)[:12] or mimetypes.guess_extension(mime) or '.bin'
            name='assets/'+safe_name(Path(filename).stem,hashlib.sha256(url.encode()).hexdigest())+extension
            self.add(name,content);self.assets[key]=name
            return self.relative(current,name)
        path_text = unquote(parsed.path)
        match = re.fullmatch(r'/api/databases/files/([a-f0-9]{32})', path_text)
        if match:
            asset_id = match[1]; root = (self.g['DATA_DIR'] / 'database_files').resolve(); path = root / asset_id
            if not path.resolve().is_relative_to(root): raise ValueError('Ruta de archivo no válida')
            metadata = path.with_suffix('.json')
            filename = json.loads(metadata.read_text()).get('name', label) if metadata.exists() else label
        elif path_text.startswith('/static/covers/'):
            path = cover_path(self.g['DATA_DIR'], Path(self.g['app'].root_path) / 'static/covers',
                              path_text[len('/static/covers/'):])
            asset_id = hashlib.sha256(str(path).encode()).hexdigest(); filename = path.name
        else:
            self.omitted(url, 'unsupported_local_asset')
            return None
        key = str(path)
        if key not in self.assets:
            if not path.is_file():
                self.omitted(url, 'local_asset_missing'); return None
            if path.stat().st_size > MAX_ASSET: raise ValueError('Un archivo supera 20 MB')
            extension = re.sub(r'[^a-zA-Z0-9.]', '', Path(filename).suffix)[:12]
            name = 'assets/' + safe_name(Path(filename).stem, asset_id) + extension
            self.add(name, path.read_bytes()); self.assets[key] = name
        return self.relative(current, self.assets[key])

    def extension(self):
        return dict(markdown_csv='.md', html='.html', pdf='.pdf', json='.json')[self.options['format']]

    def page_link(self, identifier, current, label):
        if identifier not in self.pages: return label
        return '[' + label.replace('[', '\\[').replace(']', '\\]') + '](' + self.relative(current, self.pages[identifier]['base'] + self.extension()) + ')'

    def prop_value(self, prop, current, markdown=False):
        value = prop.get('value')
        if prop.get('calculation_error') or prop.get('conversion_pending'):
            text='Error de cálculo: '+prop['calculation_error'] if prop.get('calculation_error') else 'Valor original conservado: '+display(value)
            return escape(text,quote=False) if markdown else text
        if prop.get('type') == 'files':
            parts = []
            for item in value if isinstance(value, list) else []:
                target = self.asset('/api/databases/files/' + item.get('id', ''), current, item.get('name', 'archivo'))
                if target: parts.append('[' + item.get('name', 'archivo').replace(']', '') + '](' + target + ')' if markdown else target)
            return ', '.join(parts)
        if prop.get('type') == 'relation':
            if not isinstance(value,list):return 'Valor original conservado: '+display(value)
            names = {r['id']:r['title'] for r in prop.get('related_records', [])}
            issues={r['id']:r for r in prop.get('relation_issues',[])}
            labels={'deleted':'En papelera','missing':'Registro no encontrado','wrong_source':'Otra base','source_missing':'Base no disponible'}
            parts=[]
            for key in value or []:
                if key in issues:
                    issue=issues[key];parts.append(escape(issue.get('title',key)+' · '+labels.get(issue['reason'],'No disponible')+' · '+key,quote=False) if markdown else key+' ('+labels.get(issue['reason'],'No disponible')+')')
                else:parts.append(self.page_link(key,current,names.get(key,key)) if markdown else key)
            return ', '.join(parts)
        text = display(value)
        # Plain property values are data, not executable Markdown/HTML.
        return re.sub(r'([\\`*_[\]])', r'\\\1', escape(text, quote=False)) if markdown else text

    def rewritten(self, body, current):
        return map_outside_code(body, lambda fragment: self.rewritten_text(fragment, current))

    def rewritten_text(self, body, current):
        # Rewrite real content references; literal code is preserved by caller.
        def md_link(match):
            image, label, url = match.group(1), match.group(2), match.group(3)
            try: parsed = urlsplit(url)
            except ValueError:
                if image:
                    self.asset(url,current,label)
                    return '[Archivo excluido: '+label+']'
                return match.group(0)
            local_asset = parsed.path.startswith(('/api/databases/files/', '/static/covers/'))
            remote_file = bool(parsed.scheme) and bool(re.search(r'\.(?:pdf|zip|csv|docx?|xlsx?|pptx?|txt|mp[34]|wav|png|jpe?g|gif|webp|svg)$', parsed.path, re.I))
            if image or local_asset or remote_file:
                target = self.asset(url, current, label)
                return (image + '[' + label + '](' + target + ')') if target else ('[Archivo excluido: ' + label + ']')
            ids = re.findall(r'(?:/api/entry/|[?&]open=)([^/?&#]+)', url)
            if ids and unquote(ids[0]) in self.pages: return self.page_link(unquote(ids[0]), current, label)
            return match.group(0)
        body = re.sub(r'(!?)\[([^\]\n]*)\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)', md_link, body)
        def raw_media(match):
            tag = match.group(0); found = re.search(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', tag, re.I)
            target = self.asset(found[1], current) if found else None
            return re.sub(r'((?:src|href)\s*=\s*["\'])[^"\']+', lambda m:m[1] + escape(target, quote=True), tag, flags=re.I) if target else '[Archivo excluido]'
        body = re.sub(r'<(?:img|source|video|audio|iframe)\b[^>]*>', raw_media, body, flags=re.I)
        # Raw HTML links to local media need the same exclusion/rewrite policy.
        body = re.sub(r'<a\b[^>]*href=["\']/(?:api/databases/files/|static/covers/)[^>]*>.*?</a>', lambda m: raw_media(m), body, flags=re.I | re.S)
        titles = {}
        for key, page in self.pages.items(): titles.setdefault(page['row'].get('title', ''), []).append(key)
        body = re.sub(r'\[\[([^\]\n]+)\]\]', lambda m:self.page_link(titles[m[1]][0], current, m[1]) if len(titles.get(m[1], [])) == 1 else m[0], body)
        return body

    def properties(self, row, current):
        lines = ['| Propiedad | Valor |', '| --- | --- |']
        for prop in row.get('properties', []):
            val = self.prop_value(prop, current, markdown=True).replace('|', '\\|').replace('\n', '<br>')
            lines.append('| ' + prop.get('name', prop.get('id', '')).replace('|', '\\|') + ' | ' + val + ' |')
        for prop in row.get('database_unmapped_properties', []):
            lines.append('| ' + escape(prop.get('name', 'Conservada')).replace('|', '\\|') + ' (conservada) | ' + self.prop_value(prop, current, markdown=True).replace('|', '\\|').replace('\n', ' ') + ' |')
        return '\n'.join(lines) if len(lines) > 2 else ''

    def content(self, page, current):
        body = page['body']
        for db in reversed(page['databases']):
            # database_blocks spans the JSON; replace the complete wrapper.
            left = body.rfind(':::database', 0, db['start']); right = body.find(':::', db['end']) + 3
            columns = view_columns(db['schema'],db['view'])
            headers = ['Nombre'] + [c['name'] for c in columns]
            lines = ['| ' + ' | '.join(h.replace('|', '\\|') for h in headers) + ' |', '| ' + ' | '.join('---' for h in headers) + ' |']
            for row in db['rows']:
                props = {p['id']:p for p in row['properties']}
                vals = [self.page_link(row['id'], current, row.get('title', row['id']))] + [self.prop_value(props[c['id']], current, True) for c in columns]
                lines.append('| ' + ' | '.join(v.replace('|', '\\|').replace('\n', '<br>') for v in vals) + ' |')
            csv_target = self.relative(current, db['base'] + '.csv')
            replacement = '\n\n## ' + db['schema'].get('name', 'Base de datos') + '\n\n[Datos CSV](' + csv_target + ')\n\n' + '\n'.join(lines) + '\n\n'
            body = body[:left] + replacement + body[right:]
        body = self.rewritten(body, current)
        props = self.properties(page['row'], current)
        cover = page['row'].get('cover', '')
        cover_md = ''
        cover_url = re.search(r'url\(["\']?([^"\')]+)', cover) if isinstance(cover, str) else None
        if cover_url:
            target = self.asset(cover_url[1], current, 'Portada')
            if target: cover_md = '![' + 'Portada](' + target + ')\n\n'
        children = [self.page_link(key, current, self.pages[key]['row'].get('title', key)) for key in page['children'] if key in self.pages]
        return '# ' + page['row'].get('title', 'Sin título') + '\n\n' + cover_md + props + '\n\n' + body + ('\n\n## Subpáginas\n\n' + '\n'.join('- ' + c for c in children) if children else '')

    def build(self, identifier):
        fmt = self.options['format']
        for page in self.pages.values():
            current = page['base'] + self.extension(); markdown = self.content(page, current)
            for db in page['databases']:
                csv_name = db['base'] + '.csv'; out = StringIO(newline=''); writer = csv.writer(out)
                columns = view_columns(db['schema'],db['view'])
                writer.writerow(['Nombre', 'Página'] + [c['name'] for c in columns])
                for row in db['rows']:
                    props = {p['id']:p for p in row['properties']}
                    target = self.relative(csv_name, self.pages[row['id']]['base'] + self.extension()) if row['id'] in self.pages else ''
                    writer.writerow([row.get('title', ''), target] + [self.prop_value(props[c['id']], csv_name) for c in columns])
                self.add(csv_name, out.getvalue())
            if fmt == 'markdown_csv': self.add(current, markdown)
            elif fmt == 'json':
                # Export canonical properties; file values carry portable targets,
                # not live server URLs. Body follows the same media policy.
                row = json.loads(json.dumps(page['row']))
                if self.options['include_content'] == 'no_files': row.pop('cover', None)
                for prop in row.get('properties', []) + row.get('database_unmapped_properties', []):
                    if prop.get('type') == 'files':
                        prop['value'] = [dict(name=item.get('name', 'archivo'), path=target) for item in prop.get('value', []) if (target := self.asset('/api/databases/files/' + item.get('id', ''), current, item.get('name', 'archivo')))]
                self.add(current, json.dumps(dict(row=row, markdown=markdown, databases=[dict(schema=d['schema'], view=d['view'], row_ids=[r['id'] for r in d['rows']]) for d in page['databases']]), ensure_ascii=False, indent=2))
            else:
                rendered = self.g['render_markdown'](self.g['_print_markdown'](markdown), print_mode=True)
                document = self.g['_build_pdf_html'](page['row'].get('title', 'Sin título'), '', rendered, include_toc=False)
                if fmt == 'html': self.add(current, document)
                else:
                    try: from weasyprint import HTML
                    except ImportError as error: raise RuntimeError('PDF requiere weasyprint instalado') from error
                    def fetch(url):
                        parsed = urlsplit(url)
                        path = unquote(parsed.path).lstrip('/')
                        if parsed.scheme == 'https' and parsed.netloc == 'atlas-export.invalid' and path in self.members:
                            return dict(string=self.members[path], mime_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')
                        # Existing print renderer embeds bundled local font URLs.
                        if url in self.g.get('_pdf_font_data_uri_cache', {}).values() and url.startswith('data:font/ttf;base64,'):
                            return dict(string=base64.b64decode(url.split(',', 1)[1]), mime_type='font/ttf')
                        if parsed.scheme == 'file':
                            candidate = Path(unquote(parsed.path)).resolve(); fonts = (Path(self.g['app'].root_path) / 'static' / 'fonts').resolve()
                            if candidate.is_relative_to(fonts) and candidate.is_file(): return dict(string=candidate.read_bytes(), mime_type='font/ttf')
                        raise ValueError('Recurso externo bloqueado durante la exportación PDF')
                    self.add(current, HTML(string=document, base_url='https://atlas-export.invalid/' + current, url_fetcher=fetch).write_pdf())
        self.manifest.update(entrypoint=self.pages[identifier]['base'] + self.extension(), assets=list(self.assets.values()), files=list(self.members))
        self.add('manifest.json', json.dumps(self.manifest, ensure_ascii=False, indent=2))
        out = BytesIO()
        with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, content in self.members.items(): archive.writestr(name, content)
        out.seek(0); return out


def register_record_export(app, g, h):
    from database_api import LOCK
    @app.route('/api/databases/<parent>/<source_id>/rows/<row_id>/export', methods=['POST'])
    def configured_record_export(parent, source_id, row_id):
        try:
            options = export_options(request.get_json(silent=True))
            with LOCK, closing(h['connect']()) as conn:
                index = h['read'](conn); meta = index.get(row_id)
                if not meta or meta.get('database_deleted') or meta.get('parent_id') != parent or meta.get('database_id') != source_id:
                    return jsonify(error='Registro fuera de esta base'), 404
                schema = h['source'](parent, source_id, index)[4]
                builder = RecordArchive(dict(g, app=app), h, index, options)
                builder.gather(row_id, schema)
            # Snapshot Markdown/metadata under the source lock; network/PDF/ZIP
            # work must not hold it and block unrelated cell or schema saves.
            output = builder.build(row_id)
            response = send_file(output, mimetype='application/zip', as_attachment=True, download_name=safe_name(meta.get('title', row_id), row_id) + '.zip')
            response.headers['Cache-Control'] = 'no-store'
            response.headers['X-Atlas-Export-Omissions'] = str(len(builder.manifest['omitted']))
            response.headers['X-Atlas-Export-Property-Issues'] = str(len(builder.manifest['property_issues']))
            return response
        except RuntimeError as error: return jsonify(error=str(error)), 503
        except (ValueError, TypeError, KeyError, OSError) as error: return jsonify(error=str(error)), 400
