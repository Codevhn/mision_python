"""Stage 1 contract; every store and backup is disposable."""
import json
from pathlib import Path
import shutil
import sqlite3

import pytest
import app as app_module
import database_identity as identity

A, B = 'db_' + 'a' * 32, 'db_' + 'b' * 32


def page(client, title, **extra):
    response = client.post('/api/entry', json=dict(title=title, entry_type='page', **extra))
    assert response.status_code == 200, response.get_json()
    return response.get_json()['id']


def children(client, parent, source):
    response = client.get(f'/api/entry/{parent}/children', query_string={'database_id': source})
    assert response.status_code == 200
    return response.get_json()


def test_persistence_views_peek_and_parent_move(auth_client):
    schema = dict(database_id=A, columns=[dict(id='n', name='Número', type='number')],
                  views=[dict(id='v1', name='Tabla'), dict(id='v2', name='Otra')], activeView='v1')
    body = ':::database\n' + json.dumps(schema) + '\n:::'
    parent = page(auth_client, 'Dos vistas', raw_text=body, already_markdown=True)
    row = page(auth_client, 'Persistente', parent_id=parent, db_row=True, database_id=A)
    props = [dict(id='n', name='Número', type='number', value=0)]
    auth_client.patch(f'/api/entry/{row}/properties', json={'properties': props})
    auth_client.patch(f'/api/entry/{row}/content', json={'raw_text': '# Cuerpo\n\n- Contenido', 'already_markdown': True})
    # View switch saves only the presentation in the containing Markdown.
    schema['activeView'] = 'v2'
    auth_client.patch(f'/api/entry/{parent}/content', json={'raw_text': ':::database\n' + json.dumps(schema) + '\n:::', 'already_markdown': True})
    assert children(auth_client, parent, A)[0]['properties'] == props
    assert app_module.load_index()[row]['database_id'] == A
    assert auth_client.get(f'/api/entry/{row}').get_json()['markdown'] == '# Cuerpo\n\n- Contenido'
    auth_client.post(f'/api/entry/{parent}/move-to', json={'dest': 'teamspace_root', 'teamspace': 'prueba'})
    assert [item['id'] for item in children(auth_client, parent, A)] == [row]
    # Moving a record out of its source explicitly detaches membership.
    auth_client.patch(f'/api/entry/{row}/parent', json={'parent_id': None})
    assert not children(auth_client, parent, A)
    assert 'database_id' not in app_module.load_index()[row]


def test_legacy_is_recovery_not_new_source(auth_client):
    parent = page(auth_client, 'Antigua')
    old = page(auth_client, 'Sin asignar', parent_id=parent, db_row=True)
    regular = page(auth_client, 'Subpágina', parent_id=parent)
    new = page(auth_client, 'Nueva fila', parent_id=parent, db_row=True, database_id=A)
    assert [item['id'] for item in children(auth_client, parent, A)] == [new]
    assert {item['id'] for item in children(auth_client, parent, '__legacy__') if item['db_row']} == {old}
    assert regular in {item['id'] for item in auth_client.get(f'/api/entry/{parent}/children').get_json()}


def test_cross_page_reuse_and_invalid_ids_rejected(auth_client):
    first, second = page(auth_client, 'Primera'), page(auth_client, 'Segunda')
    page(auth_client, 'Fila', parent_id=first, db_row=True, database_id=A)
    response = auth_client.post('/api/entry', json=dict(title='Intrusa', entry_type='page', parent_id=second, db_row=True, database_id=A))
    assert response.status_code == 409
    for value in ('invalid', {}, '', None):
        if value is None:
            continue
        response = auth_client.post('/api/entry', json=dict(title='Inválida', entry_type='page', parent_id=first, db_row=True, database_id=value))
        assert response.status_code == 400
    assert auth_client.get(f'/api/entry/{first}/children?database_id=bad').status_code == 400


def test_duplicate_page_rekeys_sources_but_row_copy_keeps_membership(auth_client):
    parent = page(auth_client, 'Fuente', raw_text=':::database\n' + json.dumps(dict(database_id=A, views=[{'id': 'v'}])) + '\n:::', already_markdown=True)
    row = page(auth_client, 'Fila', parent_id=parent, db_row=True, database_id=A)
    copy = auth_client.post(f'/api/entry/{parent}/duplicate').get_json()['id']
    text = auth_client.get(f'/api/entry/{copy}').get_json()['markdown']
    source = list(identity.database_blocks(text))[0][2]['database_id']
    assert source != A and identity.valid_id(source)
    assert not children(auth_client, copy, source)
    row_copy = auth_client.post(f'/api/entry/{row}/duplicate').get_json()['id']
    assert {item['id'] for item in children(auth_client, parent, A)} == {row, row_copy}
    assert app_module.load_index()[row_copy]['uid'] != app_module.load_index()[row]['uid']


@pytest.fixture(params=['sqlite', 'json'])
def legacy_store(tmp_path, request):
    root = tmp_path / 'store'
    (root / 'data').mkdir(parents=True)
    pages = root / 'knowledge/pages'
    pages.mkdir(parents=True)
    schema = dict(columns=[dict(id='n', name='Número', type='number')], filter=None, custom={'keep': True})
    block = ':::database\n' + json.dumps(schema) + '\n:::\n'
    contents = {'one': '# Antes\n\n' + block + '\nDespués\n', 'two': block + '\n' + block,
                'r1': '# Cuerpo\n\n- Uno\n', 'r2': 'Ambigua\n', 'missing': 'Sin bandera\n', 'normal': 'Subpágina\n'}
    meta = {key: dict(type='page', uid=key, title=key, order=i, properties=[{'id': 'n', 'value': 0}, {'id': 'b', 'value': False}]) for i, key in enumerate(contents)}
    for key, parent, flag in [('r1', 'one', True), ('r2', 'two', True), ('normal', 'one', False)]:
        meta[key].update(parent_id=parent, db_row=flag)
    meta['missing']['parent_id'] = 'one'
    for key, content in contents.items():
        (pages / (key + '.md')).write_text(content)
    (pages / '.history').mkdir()
    (pages / '.history/r1_old.md').write_text('Cuerpo anterior\n')
    (root / 'data/settings.json').write_text('{"preserve": true}')
    if request.param == 'sqlite':
        with sqlite3.connect(root / 'data/index.db') as conn:
            conn.execute('CREATE TABLE entries (entry_id TEXT PRIMARY KEY, meta TEXT NOT NULL)')
            conn.executemany('INSERT INTO entries VALUES (?, ?)', [(key, json.dumps(value)) for key, value in meta.items()])
    else:
        (root / 'data/index.json').write_text(json.dumps(meta))
    return root, meta, contents


def test_migration_preserves_all_data_backup_restore_and_is_repeatable(legacy_store, tmp_path):
    root, before, contents = legacy_store
    journal = identity.prepare(root, tmp_path / 'backup')
    preview = json.loads(journal.read_text())
    assert preview['sources']['one'][0] != preview['sources']['two'][0]
    assert len(set(preview['sources']['two'])) == 2
    assert preview['backup_manifest']['knowledge/pages/.history/r1_old.md'] == identity.digest(b'Cuerpo anterior\n')
    assert {item['entry_id'] for item in preview['unresolved']} == {'r2', 'missing'}
    result = identity.apply(journal)
    first_files = {p.relative_to(root): p.read_bytes() for p in (root / 'knowledge').rglob('*') if p.is_file()}
    raw, _ = identity.read_index(root)
    after = {key: json.loads(value) for key, value in raw.items()}
    for key, meta in before.items():
        assert {k: v for k, v in after[key].items() if k != 'database_id'} == meta
    assert after['r1']['database_id'] == result['sources']['one'][0]
    assert 'database_id' not in after['r2'] and 'database_id' not in after['missing']
    for key in ('r1', 'r2', 'missing', 'normal'):
        assert (root / 'knowledge/pages' / (key + '.md')).read_text() == contents[key]
    assert (root / 'knowledge/pages/one.md').read_text().startswith('# Antes\n\n:::database\n')
    assert (root / 'knowledge/pages/one.md').read_text().endswith('\nDespués\n')
    identity.apply(journal)
    assert identity.read_index(root)[0] == raw
    assert {p.relative_to(root): p.read_bytes() for p in (root / 'knowledge').rglob('*') if p.is_file()} == first_files
    repeated = identity.inventory(root)
    assert not repeated['edits'] and not repeated['memberships']
    # Restore into a NEW root, without overwriting a working store.
    restore = tmp_path / 'restored'
    for name in ('data', 'knowledge'):
        shutil.copytree(tmp_path / 'backup' / name, restore / name)
    restored, _ = identity.read_index(restore)
    assert {key: json.loads(value) for key, value in restored.items()} == before
    for key, content in contents.items():
        assert (restore / 'knowledge/pages' / (key + '.md')).read_text() == content
    assert (restore / 'knowledge/pages/.history/r1_old.md').read_text() == 'Cuerpo anterior\n'
    # Reviewed ownership: a SECOND, backed-up plan assigns only explicit rows.
    source = result['sources']['two'][1]
    second = identity.prepare(root, tmp_path / 'resolved', {'r2': source, 'missing': None})
    identity.apply(second)
    assert json.loads(identity.read_index(root)[0]['r2'])['database_id'] == source
    assert 'database_id' not in json.loads(identity.read_index(root)[0]['missing'])
    assert json.loads(identity.read_index(root)[0]['missing'])['db_row'] is False
    assert not identity.inventory(root)['unresolved']


def test_stale_plan_stops_before_any_source_write(legacy_store, tmp_path):
    root, _, _ = legacy_store
    journal = identity.prepare(root, tmp_path / 'backup')
    path = root / 'knowledge/pages/r1.md'
    path.write_text('Cambio posterior')
    before = (root / 'knowledge/pages/one.md').read_bytes()
    with pytest.raises(ValueError, match='Markdown cambió'):
        identity.apply(journal)
    assert (root / 'knowledge/pages/one.md').read_bytes() == before


def test_crash_between_markdown_and_index_can_resume(legacy_store, tmp_path, monkeypatch):
    root, _, _ = legacy_store
    journal = identity.prepare(root, tmp_path / 'backup')
    replace = identity.os.replace
    written = []
    def fail_once(src, dst):
        if str(dst).endswith('two.md') and not written:
            written.append(True)
            raise OSError('simulated crash')
        return replace(src, dst)
    monkeypatch.setattr(identity.os, 'replace', fail_once)
    with pytest.raises(OSError, match='simulated crash'):
        identity.apply(journal)
    monkeypatch.setattr(identity.os, 'replace', replace)
    assert identity.apply(journal)['status'] == 'complete'
    assert not identity.inventory(root)['memberships']


def test_preview_no_writes_and_duplicate_identity_rejected(legacy_store):
    root, _, _ = legacy_store
    before = {p: p.read_bytes() for p in root.rglob('*') if p.is_file()}
    identity.inventory(root)
    assert {p: p.read_bytes() for p in root.rglob('*') if p.is_file()} == before
    path = root / 'knowledge/pages/one.md'
    block = ':::database\n' + json.dumps({'database_id': A}) + '\n:::\n'
    path.write_text(block + block)
    with pytest.raises(ValueError, match='repetida'):
        identity.inventory(root)


def test_code_fences_do_not_become_databases():
    assert not list(identity.database_blocks('```md\n:::database\n{}\n:::\n```\n'))


def test_unassigned_rows_of_identified_source_need_explicit_review(legacy_store):
    root, _, _ = legacy_store
    path = root / 'knowledge/pages/one.md'
    path.write_text(':::database\n' + json.dumps({'database_id': A}) + '\n:::\n')
    preview = identity.inventory(root)
    assert 'r1' not in preview['memberships']
    reviewed = identity.inventory(root, {'r1': A})
    assert json.loads(reviewed['memberships']['r1']['after'])['database_id'] == A


def test_metadata_conflict_blocks_markdown_changes(legacy_store, tmp_path):
    root, _, _ = legacy_store
    journal = identity.prepare(root, tmp_path / 'backup')
    raw, store = identity.read_index(root)
    changed = json.loads(raw['r1'])
    changed['order'] = 999
    if store == 'sqlite':
        with sqlite3.connect(root / 'data/index.db') as conn:
            conn.execute('UPDATE entries SET meta=? WHERE entry_id=?', (json.dumps(changed), 'r1'))
    else:
        index = json.loads((root / 'data/index.json').read_text())
        index['r1'] = changed
        (root / 'data/index.json').write_text(json.dumps(index))
    before = (root / 'knowledge/pages/one.md').read_bytes()
    with pytest.raises(ValueError, match='Metadatos cambiaron'):
        identity.apply(journal)
    assert (root / 'knowledge/pages/one.md').read_bytes() == before


def test_assignment_cannot_cross_parent(legacy_store):
    root, _, _ = legacy_store
    (root / 'knowledge/pages/one.md').write_text(':::database\n' + json.dumps({'database_id': A}) + '\n:::\n')
    with pytest.raises(ValueError, match='Asignación no válida'):
        identity.inventory(root, {'r2': A})


def test_backup_captures_committed_sqlite_wal(legacy_store, tmp_path):
    root, _, _ = legacy_store
    if identity.read_index(root)[1] != 'sqlite':
        # Run the same WAL scenario starting from a legacy JSON store.
        raw, _ = identity.read_index(root)
        with sqlite3.connect(root / 'data/index.db') as conn:
            conn.execute('CREATE TABLE entries (entry_id TEXT PRIMARY KEY, meta TEXT NOT NULL)')
            conn.executemany('INSERT INTO entries VALUES (?, ?)', raw.items())
    with sqlite3.connect(root / 'data/index.db') as writer:
        writer.execute('PRAGMA journal_mode=WAL')
        meta = json.loads(identity.read_index(root)[0]['r1'])
        meta['wal_only_value'] = 'committed'
        writer.execute('UPDATE entries SET meta=? WHERE entry_id=?', (json.dumps(meta), 'r1'))
        writer.commit()
        assert (root / 'data/index.db-wal').exists()
        identity.prepare(root, tmp_path / 'wal-backup')
        assert json.loads(identity.read_index(tmp_path / 'wal-backup')[0]['r1'])['wal_only_value'] == 'committed'


def test_corrupted_backup_prevents_migration(legacy_store, tmp_path):
    root, _, _ = legacy_store
    journal = identity.prepare(root, tmp_path / 'backup')
    before = (root / 'knowledge/pages/one.md').read_bytes()
    (journal.parent / 'knowledge/pages/.history/r1_old.md').write_text('corrupted')
    with pytest.raises(ValueError, match='Respaldo incompleto o alterado'):
        identity.apply(journal)
    assert (root / 'knowledge/pages/one.md').read_bytes() == before
