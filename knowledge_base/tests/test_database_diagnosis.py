"""Characterize the audited API at 6e84f20, not the desired future contract.

These observations deliberately describe missing isolation/validation. Replace
with acceptance assertions when the fixes in docs/DATABASE_AUDIT.md are built.
All data uses tests/conftest.py's disposable database and knowledge directory.
"""
import pytest


def create_page(client, title, **extra):
    response = client.post('/api/entry', json={
        'title': title, 'entry_type': 'page', **extra,
    })
    assert response.status_code == 200
    return response.get_json()['id']


def test_current_row_creation_does_not_preserve_database_identity(auth_client):
    parent = create_page(auth_client, 'Página con bases')
    row = create_page(auth_client, 'Fila A', parent_id=parent, db_row=True, database_id='base-a')
    meta = auth_client.get(f'/api/entry/{row}').get_json()['meta']
    assert meta['parent_id'] == parent and meta['db_row'] is True
    assert 'database_id' not in meta


def test_current_children_query_is_page_scoped_even_with_database_parameter(auth_client):
    parent = create_page(auth_client, 'Página con dos bases')
    rows = {create_page(auth_client, title, parent_id=parent, db_row=True, database_id=database)
            for title, database in [('Fila A', 'base-a'), ('Fila B', 'base-b')]}
    for database in ('base-a', 'base-b'):
        response = auth_client.get(f'/api/entry/{parent}/children?database_id={database}')
        assert response.status_code == 200
        assert {row['id'] for row in response.get_json() if row['db_row']} == rows


@pytest.mark.parametrize('property_type,value', [
    ('checkbox', 'No iniciado'), ('number', 'no es un número'),
    ('multi_select', 'una cadena'), ('date', {'fecha': 'imposible'}),
])
def test_current_properties_endpoint_accepts_incompatible_values(auth_client, property_type, value):
    row = create_page(auth_client, 'Fila con propiedad')
    properties = [{'id': 'col_audit', 'name': 'Dato', 'type': property_type, 'value': value}]
    response = auth_client.patch(f'/api/entry/{row}/properties', json={'properties': properties})
    assert response.status_code == 200
    assert auth_client.get(f'/api/entry/{row}').get_json()['meta']['properties'] == properties


def test_current_whole_index_saves_can_lose_an_interleaved_row_update(auth_client):
    # Deterministic interleaving of two read-modify-save operations, as used
    # by two concurrent PATCH /properties requests. Not a timing-based test.
    import app as app_module
    first = create_page(auth_client, 'Primera fila')
    second = create_page(auth_client, 'Segunda fila')
    request_a = app_module.load_index()
    request_b = app_module.load_index()
    request_a[first]['properties'] = [{'id': 'p', 'name': 'Nombre nuevo', 'type': 'text', 'value': 'A'}]
    app_module.save_index(request_a)
    request_b[second]['properties'] = [{'id': 'p', 'name': 'Nombre nuevo', 'type': 'text', 'value': 'B'}]
    app_module.save_index(request_b)
    final = app_module.load_index()
    assert 'properties' not in final[first]
    assert final[second]['properties'][0]['value'] == 'B'
