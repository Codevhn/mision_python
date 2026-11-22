import json

import pytest

import app as atlas
from test_assistant import create, setup_model


@pytest.fixture
def lesson(auth_client):
    course = auth_client.post('/api/courses', json={'label': 'Java'}).json['id']
    entry_id = auth_client.post('/api/courses/entry', json={
        'title': 'Entornos de desarrollo', 'course': course, 'module': 'Uno',
        'raw_text': '## Eclipse IDE\n\nContenido existente.',
    }).json['id']
    index = atlas.load_index()
    index[entry_id].update(custom_marker='preserve')
    atlas.save_index(index)
    return entry_id


def test_learning_guide_persists_without_changing_document(auth_client, lesson):
    before = auth_client.get(f'/api/entry/{lesson}').json
    guide = {'lesson_objective': ' Distinguir los IDE de Java. ', 'lesson_guidance': 'Explicar funciones comunes una sola vez.'}
    response = auth_client.patch(f'/api/entry/{lesson}/learning-guide', json=guide)
    assert response.status_code == 200
    after = auth_client.get(f'/api/entry/{lesson}').json
    assert after['meta']['lesson_objective'] == guide['lesson_objective'].strip()
    assert after['meta']['lesson_guidance'] == guide['lesson_guidance']
    assert after['markdown'] == before['markdown']
    assert after['meta']['custom_marker'] == 'preserve'
    # A normal body save must retain metadata; a partial guide save can clear
    # one field without wiping the other or unrelated metadata.
    assert auth_client.patch(f'/api/entry/{lesson}/content', json={'raw_text': before['markdown'], 'already_markdown': True}).status_code == 200
    assert auth_client.patch(f'/api/entry/{lesson}/learning-guide', json={'lesson_objective': ''}).status_code == 200
    meta = auth_client.get(f'/api/entry/{lesson}').json['meta']
    assert meta['lesson_objective'] == ''
    assert meta['lesson_guidance'] == guide['lesson_guidance']


@pytest.mark.parametrize('payload', [None, [], {}, {'title': 'Overwrite'}, {'lesson_objective': None}, {'lesson_guidance': 'x' * 4001}])
def test_invalid_learning_guide_does_not_change_metadata(auth_client, lesson, payload):
    before = atlas.load_index()[lesson]
    response = auth_client.patch(f'/api/entry/{lesson}/learning-guide', data=json.dumps(payload), content_type='application/json')
    assert response.status_code == 400
    assert atlas.load_index()[lesson] == before


@pytest.mark.parametrize('updates,status', [({'database_locked': True}, 423), ({'database_deleted': True}, 410), ({'type': 'page'}, 400)])
def test_learning_guide_respects_entry_state(auth_client, lesson, updates, status):
    index = atlas.load_index();index[lesson].update(updates);atlas.save_index(index)
    assert auth_client.patch(f'/api/entry/{lesson}/learning-guide', json={'lesson_objective': 'New'}).status_code == status
    assert 'lesson_objective' not in atlas.load_index()[lesson]


def test_learning_guide_requires_auth_and_existing_lesson(client, auth_client):
    client.get('/logout')
    assert client.patch('/api/entry/missing/learning-guide', json={'lesson_objective': 'New'}).status_code == 401
    client.post('/login', data={'password': 'test-password'})
    assert client.patch('/api/entry/missing/learning-guide', json={'lesson_objective': 'New'}).status_code == 404


def test_assistant_uses_saved_guide_and_updates_after_edit(auth_client, monkeypatch, lesson):
    captured = [];setup_model(monkeypatch, captured)
    route = '/api/assistant/conversations/' + create(auth_client) + '/messages'
    for goal in ['Distinguir alternativas.', 'Elegir un entorno adecuado.']:
        assert auth_client.patch(f'/api/entry/{lesson}/learning-guide', json={
            'lesson_objective': goal, 'lesson_guidance': 'Evitar comparativas repetidas.',
        }).status_code == 200
        response = auth_client.post(route, json={
            'prompt': 'Explica Eclipse IDE', 'selection_action': 'explain',
            'selection_context': {'text': 'Eclipse IDE', 'title': 'Entornos de desarrollo', 'entry_id': lesson},
            'current_context': {'type': 'entry', 'id': lesson, 'lesson_objective': 'Forged browser goal'},
            'use_atlas': False,
        })
        assert 'event: done' in response.get_data(as_text=True)
        system = captured[-1][0]
        current = json.loads(system.split('\n')[-1])['current_context']
        assert current['lesson_objective'] == goal
        assert current['lesson_guidance'] == 'Evitar comparativas repetidas.'
        assert 'no inventes un objetivo confirmado' in system
