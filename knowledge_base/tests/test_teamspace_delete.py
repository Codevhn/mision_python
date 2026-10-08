import app as app_module


def create(client, title, **extra):
    response = client.post('/api/entry', json={
        'title': title, 'entry_type': 'teamspace', 'teamspace': 'Mi Team',
        'raw_text': 'Contenido conservado', 'already_markdown': True, **extra,
    })
    assert response.status_code == 200
    return response.get_json()['id']


def test_delete_team_removes_members_descendants_and_relations_only(auth_client):
    home = create(auth_client, 'Inicio del Team', is_teamspace_home=True)
    member = create(auth_client, 'Página independiente')
    child = create(auth_client, 'Subpágina', entry_type='page', parent_id=member)
    other = create(auth_client, 'Otro Team', teamspace='Otro Team')
    index = app_module.load_index()
    files = [app_module._entry_path(eid, index[eid]) for eid in (home, member, child)]
    assert all(path.exists() for path in files)
    deleted_uid = index[member]['uid']
    other_uid = index[other]['uid']
    app_module.save_relations({'relations': {
        'removed': {'from_uid': deleted_uid, 'to_uid': other_uid},
        'kept': {'from_uid': other_uid, 'to_uid': other_uid},
    }})
    response = auth_client.delete('/api/teamspace/mi-team')
    assert response.status_code == 200
    assert set(response.get_json()['deleted_ids']) == {home, member, child}
    assert all(not path.exists() for path in files)
    assert set(app_module.load_index()) == {other}
    assert set(app_module.load_relations()['relations']) == {'kept'}
    assert 'mi-team' not in auth_client.get('/api/teamspace/tree').get_json()
    assert auth_client.delete('/api/teamspace/mi-team').status_code == 404


def test_delete_team_requires_authentication(client):
    assert client.delete('/api/teamspace/mi-team').status_code == 401
