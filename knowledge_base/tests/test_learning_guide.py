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


@pytest.mark.parametrize('truncated', [False, True])
def test_full_lesson_is_a_scoped_reviewable_draft(auth_client, monkeypatch, lesson, truncated):
    captured = [];setup_model(monkeypatch, captured)
    answer = '## IntelliJ IDEA\n\nPrimera sección.\n\n## Eclipse IDE\n\nSegunda sección.'
    def stream(system, messages, **kwargs):
        captured.append((system, messages, kwargs))
        yield answer
        yield ('__done__', truncated, None)
    monkeypatch.setattr(atlas, '_stream_call_ai', stream)
    reviews = []
    def reviewer(system, prompt, **kwargs):
        reviews.append(kwargs)
        return json.loads(prompt.split('\n')[-1])['draft'], None
    monkeypatch.setattr(atlas, '_call_ai', reviewer)
    auth_client.patch(f'/api/entry/{lesson}/learning-guide', json={'lesson_objective': 'Distinguir alternativas.', 'lesson_guidance': 'Una explicación continua.'})
    before = auth_client.get(f'/api/entry/{lesson}').json['markdown']
    conversation = create(auth_client)
    response = auth_client.post(f'/api/assistant/conversations/{conversation}/messages', json={
        'prompt': 'Desarrolla toda la lección.', 'lesson_action': 'develop',
        'current_context': {'type': 'entry', 'id': lesson, 'lesson_outline': [
            {'level': 2, 'title': 'IntelliJ IDEA'}, {'level': 2, 'title': 'Eclipse IDE'}]},
        'use_atlas': False,
    })
    assert 'event: done' in response.get_data(as_text=True)
    system, messages, options = captured[-1]
    assert 'LECCIÓN COMPLETA' in system
    current = json.loads(system.split('\n')[-1])['current_context']
    assert current['learning_task']['action'] == 'develop_lesson'
    assert current['lesson_objective'] == 'Distinguir alternativas.'
    assert len(current['lesson_outline']) == 2
    assert options['max_tokens'] == 8000
    record = auth_client.get(f'/api/assistant/conversations/{conversation}').json
    assert record['messages'][-2]['lesson_action'] == 'develop'
    assert record['messages'][-1]['content'] == answer
    assert record['messages'][-1]['lesson_draft'] == {'entry_id': lesson, 'truncated': truncated}
    assert record['messages'][-1]['lesson_review']['status'] == ('skipped_incomplete' if truncated else 'completed')
    assert len(reviews) == (0 if truncated else 1)
    if reviews:
        assert reviews[0]['provider'] == options['provider']
        assert reviews[0]['model'] == options['model']
        assert reviews[0]['fail_on_truncation'] is True
    assert auth_client.get(f'/api/entry/{lesson}').json['markdown'] == before


@pytest.mark.parametrize('review_result', ['corrected', 'error', 'missing_section'])
def test_full_lesson_review_precedes_delivery_and_never_changes_document(auth_client, monkeypatch, lesson, review_result):
    setup_model(monkeypatch, [])
    original = '## Eclipse IDE\n\nBORRADOR SIN REVISAR.'
    corrected = '## Eclipse IDE\n\nExplicación coordinada con el objetivo.'
    def stream(*args, **kwargs):
        yield original
        yield ('__done__', False, None)
    def reviewer(system, prompt, **kwargs):
        payload = json.loads(prompt.split('\n')[-1])
        assert payload['draft'] == original
        assert 'Continuidad didáctica' in system
        assert 'No fuerces un mismo ejemplo' in system
        if review_result == 'error':
            return None, 'Simulated provider failure'
        if review_result == 'missing_section':
            return '## Otro tema\n\nTema incorrecto.', None
        return corrected, None
    monkeypatch.setattr(atlas, '_stream_call_ai', stream)
    monkeypatch.setattr(atlas, '_call_ai', reviewer)
    before = auth_client.get(f'/api/entry/{lesson}').json['markdown']
    conversation = create(auth_client)
    response = auth_client.post(f'/api/assistant/conversations/{conversation}/messages', json={
        'prompt': 'Desarrolla toda la lección.', 'lesson_action': 'develop',
        'current_context': {'type': 'entry', 'id': lesson, 'lesson_outline': [{'level': 2, 'title': 'Eclipse IDE'}]},
    })
    body = response.get_data(as_text=True)
    assert 'BORRADOR SIN REVISAR' not in body
    record = auth_client.get(f'/api/assistant/conversations/{conversation}').json
    if review_result == 'corrected':
        assert 'event: done' in body
        assert record['messages'][-1]['content'] == corrected
    else:
        assert 'event: error' in body
        assert 'event: done' not in body
        assert record['messages'][-1]['role'] == 'user'
    assert auth_client.get(f'/api/entry/{lesson}').json['markdown'] == before


@pytest.mark.parametrize('extra', [
    {'current_context': None},
    {'lesson_action': 'unknown'},
    {'selection_context': {'text': 'Eclipse IDE', 'title': 'Tema'}},
])
def test_invalid_full_lesson_action_does_not_store_a_message(auth_client, monkeypatch, lesson, extra):
    captured = [];setup_model(monkeypatch, captured)
    conversation = create(auth_client)
    response = auth_client.post(f'/api/assistant/conversations/{conversation}/messages', json={
        'prompt': 'Desarrolla toda la lección.', 'lesson_action': 'develop',
        'current_context': {'type': 'entry', 'id': lesson}, **extra,
    })
    assert response.status_code == 400
    assert not captured
    assert auth_client.get(f'/api/assistant/conversations/{conversation}').json['messages'] == []
