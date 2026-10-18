"""Dashboard writes presentation only; canonical row ownership never changes."""
from test_database_workspace import workspace, create, schema_change, B


def test_dashboard_multi_source_layout_widget_config_and_reload_preserve_records(workspace):
    client, base, parent = workspace
    other = f'/api/databases/{parent}/{B}'
    left = create(client, base, values={'n': 9, 's': 'Pendiente'})
    right = create(client, other)
    client.patch('/api/entry/' + left['id'] + '/content', json={
        'raw_text': '## Cuerpo compartido\n\nSe conserva.', 'already_markdown': True})
    before_left = client.get('/api/entry/' + left['id']).json
    before_right = client.get('/api/entry/' + right['id']).json
    original = client.get(base).json['schema']
    layout = dict(version=1, widgets=[
        dict(id='w_a', base=base, title='En curso', span=8, height=400,
             sourceViewId='b', view=dict(type='board', groupBy='s',
                 filters=[dict(colId='n', op='gt', value=3)],
                 sorts=[dict(colId='n', dir='desc')], hidden=['text'], openMode='side')),
        dict(id='w_b', base=other, title='Segunda fuente', span=4, height=260,
             sourceViewId='v', view=dict(type='list', filters=[], sorts=[]))],
        globalFilters=[dict(id='global_1', type='number', op='gt', value=5,
                           mapping={base:'n'}, enabled=True)])
    schema = dict(original, views=original['views'] + [dict(id='d', name='Panel', type='dashboard', dashboard=layout)], activeView='d')
    saved = schema_change(client, base, operation='schema', schema=schema)
    assert saved.status_code == 200
    assert client.get(base).json['schema']['views'][-1]['dashboard'] == layout
    # Resize/reorder and duplicate only widget configuration, never records.
    layout['widgets'][0]['width'] = 43.2175
    layout['widgets'][0]['height'] = 487
    layout['widgets'].reverse()
    layout['widgets'].append(dict(layout['widgets'][1], id='w_a_copy', title='Copia de widget'))
    assert schema_change(client, base, operation='schema', schema=schema).status_code == 200
    reloaded = client.get(base).json
    assert reloaded['schema']['views'][-1]['dashboard'] == layout
    assert reloaded['schema']['views'][:2] == original['views']
    assert [row['id'] for row in reloaded['rows']] == [left['id']]
    assert [row['id'] for row in client.get(other).json['rows']] == [right['id']]
    assert client.get('/api/entry/' + left['id']).json == before_left
    assert client.get('/api/entry/' + right['id']).json == before_right
    # Edits from any widget use the existing scoped source endpoint.
    assert client.patch(base + '/rows/' + left['id'], json={'values': {'n': 17}}).status_code == 200
    assert next(p['value'] for p in client.get(base).json['rows'][0]['properties'] if p['id'] == 'n') == 17
    assert client.patch(other + '/rows/' + left['id'], json={'values': {}}).status_code == 404
    # Removing all widgets does not remove or move canonical records/content.
    schema['views'][-1]['dashboard']['widgets'] = []
    assert schema_change(client, base, operation='schema', schema=schema).status_code == 200
    assert client.get(base).json['rows'][0]['id'] == left['id']
    assert client.get('/api/entry/' + left['id']).json['markdown'] == before_left['markdown']
