import json
import sqlite3

import app as app_module
from assistant import atlas_context


def test_stream_request_delivers_atlas_system_context(auth_client, monkeypatch):
    monkeypatch.setenv('DEEPSEEK_API_KEY', 'test-key')
    captured = []

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def __iter__(self):
            return iter([b'data: {"choices":[{"delta":{"content":"Respuesta"},"finish_reason":null}]}\n', b'data: [DONE]\n'])

    def urlopen(request, **kwargs):
        captured.append(json.loads(request.data))
        return Response()

    monkeypatch.setattr(app_module.urllib.request, 'urlopen', urlopen)
    system = 'Datos de Atlas: última lección estudiada CSS Grid'
    history = [{'role': 'user', 'content': '¿Por dónde me quedé?'}]
    result = list(app_module._stream_call_ai(system, history, provider='deepseek', model='deepseek-v4-pro'))
    assert result[0] == 'Respuesta'
    assert captured[0]['messages'] == [{'role': 'system', 'content': system}] + history
    assert history == [{'role': 'user', 'content': '¿Por dónde me quedé?'}]


def create(client):
    response = client.post('/api/assistant/conversations', json={})
    assert response.status_code == 201
    return response.json['id']


def setup_model(monkeypatch, captured):
    monkeypatch.setenv('DEEPSEEK_API_KEY', 'test-key')

    def stream(system, messages, **kwargs):
        captured.append((system, messages, kwargs))
        yield 'Respuesta de prueba'
        yield ('__done__', False, None)

    monkeypatch.setattr(app_module, '_stream_call_ai', stream)


def test_assistant_requires_auth(client):
    assert client.get('/api/assistant/conversations').status_code == 401
    assert client.post('/api/assistant/conversations', json={}).status_code == 401


def test_conversation_persists_thread_separate_from_lessons(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    conversation_id = create(auth_client)
    route = f'/api/assistant/conversations/{conversation_id}'
    for question in ['Explícame CSS Grid', '¿Y cómo se usa minmax?']:
        response = auth_client.post(route + '/messages', json={'prompt': question, 'use_atlas': False})
        assert response.status_code == 200
        assert 'event: done' in response.get_data(as_text=True)
    record = auth_client.get(route).json
    assert len(record['messages']) == 4
    assert record['messages'][2]['content'] == '¿Y cómo se usa minmax?'
    assert 'html' in record['messages'][1]
    assert [message['role'] for message in captured[1][1]] == ['user', 'assistant', 'user']
    assert 'minmax' in captured[1][1][-1]['content']
    assert auth_client.get('/api/ai/conversations').json['conversations'] == []
    assert auth_client.delete(route).status_code == 200
    assert auth_client.get(route).status_code == 404


def test_invalid_input_and_missing_model_do_not_change_history(auth_client, monkeypatch):
    conversation_id = create(auth_client)
    route = f'/api/assistant/conversations/{conversation_id}'
    assert auth_client.post(route + '/messages', json={'prompt': ' '}).status_code == 400
    assert auth_client.post(route + '/messages', json={'prompt': 'hola', 'provider': ['invalid']}).status_code == 400
    monkeypatch.delenv('DEEPSEEK_API_KEY', raising=False)
    assert auth_client.post(route + '/messages', json={'prompt': 'hola'}).status_code == 503
    assert auth_client.get(route).json['messages'] == []


def test_long_thread_summary_keeps_full_transcript(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    conversation_id = create(auth_client)
    route = f'/api/assistant/conversations/{conversation_id}'
    record = auth_client.get(route).json
    record['messages'] = [{'role': 'user' if i % 2 == 0 else 'assistant', 'content': f'Turno {i} sobre CSS Grid'} for i in range(30)]
    with sqlite3.connect(app_module.DATA_DIR / 'assistant.db') as db:
        db.execute('UPDATE conversations SET payload=? WHERE id=?', (json.dumps(record), conversation_id))
    summaries = []

    def summarize(system, content, **kwargs):
        summaries.append(content)
        return 'El usuario está estudiando CSS Grid y minmax.', None

    monkeypatch.setattr(app_module, '_call_ai', summarize)
    response = auth_client.post(route + '/messages', json={'prompt': 'Sigamos con ejemplos', 'use_atlas': False})
    assert 'event: done' in response.get_data(as_text=True)
    saved = auth_client.get(route).json
    assert len(saved['messages']) == 32
    assert saved['memory_through'] == 18
    assert 'CSS Grid' in captured[0][0]
    assert len(captured[0][1]) == 13
    assert summaries


def test_failed_stream_preserves_question_and_does_not_save_fake_answer(auth_client, monkeypatch):
    monkeypatch.setenv('DEEPSEEK_API_KEY', 'test-key')

    def broken(*args, **kwargs):
        yield None, {'error': 'Proveedor desconectado'}

    monkeypatch.setattr(app_module, '_stream_call_ai', broken)
    conversation_id = create(auth_client)
    route = f'/api/assistant/conversations/{conversation_id}'
    response = auth_client.post(route + '/messages', json={'prompt': 'hola', 'use_atlas': False})
    assert 'event: error' in response.get_data(as_text=True)
    assert auth_client.get(route).json['messages'] == [{'role': 'user', 'content': 'hola'}]


def test_retrieval_uses_saved_notes_progress_and_activity(auth_client, monkeypatch):
    index = {
        'grid': {'title': 'CSS Grid', 'type': 'page', 'status': 'pendiente'},
        'lesson': {'title': 'Flexbox', 'type': 'course', 'course': 'css', 'module': 'layout', 'status': 'completado'},
    }
    monkeypatch.setattr(app_module, 'load_index', lambda: index)
    monkeypatch.setattr(app_module, 'load_courses', lambda: {'courses': {'css': {'label': 'Curso CSS'}}})
    monkeypatch.setattr(app_module, 'load_activity', lambda: {'studying': [{'id': 'lesson'}], 'recent': []})
    folder = app_module.KNOWLEDGE_DIR / 'pages'
    folder.mkdir()
    (folder / 'grid.md').write_text('Usa grid-template-columns y minmax para definir las columnas.')
    context, sources = atlas_context(app_module.__dict__, '¿Qué tengo sobre minmax?')
    data = json.loads(context)
    assert data['matching_notes'][0]['id'] == 'grid'
    assert data['recent_studying'][0]['title'] == 'Flexbox'
    assert data['courses'][0]['completed'] == 1
    assert {source['id'] for source in sources} == {'grid', 'lesson'}


def test_atlas_opt_out_excludes_private_context(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    monkeypatch.setattr(app_module, 'load_index', lambda: (_ for _ in ()).throw(AssertionError('Should not read Atlas')))
    conversation_id = create(auth_client)
    response = auth_client.post(f'/api/assistant/conversations/{conversation_id}/messages', json={'prompt': 'hola', 'use_atlas': False})
    assert 'event: done' in response.get_data(as_text=True)
    assert 'Datos actuales de Atlas' not in captured[0][0]


def test_simple_greeting_does_not_retrieve_atlas(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    monkeypatch.setattr(app_module, 'load_index', lambda: (_ for _ in ()).throw(AssertionError('Greeting should not read Atlas')))
    route = '/api/assistant/conversations/' + create(auth_client)
    response = auth_client.post(route + '/messages', json={'prompt': '¡Hola!', 'use_atlas': True})
    assert 'event: done' in response.get_data(as_text=True)
    assert 'Datos actuales de Atlas' not in captured[0][0]
    assert auth_client.get(route).json['messages'][-1]['sources'] == []


def test_greeting_with_actual_question_still_retrieves_context(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    monkeypatch.setattr(app_module, 'load_index', lambda: {'page': {'title': 'Mi página', 'type': 'page'}})
    route = '/api/assistant/conversations/' + create(auth_client) + '/messages'
    response = auth_client.post(route, json={'prompt': 'Hola, ¿qué tengo pendiente?', 'use_atlas': True})
    assert 'event: done' in response.get_data(as_text=True)
    assert 'Mi página' in captured[0][0]


def test_context_preserves_teamspace_and_page_hierarchy(auth_client, monkeypatch):
    index = {
        'home': {'title': 'Desarrollo', 'type': 'teamspace', 'teamspace': 'dev', 'teamspace_label': 'Equipo Desarrollo', 'is_teamspace_home': True},
        'parent': {'title': 'Recursos', 'type': 'page', 'parent_id': 'home'},
        'apis': {'title': 'APIs', 'type': 'page', 'parent_id': 'parent'},
    }
    monkeypatch.setattr(app_module, 'load_index', lambda: index)
    monkeypatch.setattr(app_module, 'load_activity', lambda: {'studying': [{'id': 'apis'}], 'recent': [{'id': 'apis', 'ts': 1234}]})
    data = json.loads(atlas_context(app_module.__dict__, 'Qué hay dentro de APIs')[0])
    entry = data['recent_visited'][0]
    assert entry['type'] == 'page'
    assert entry['teamspace_label'] == 'Equipo Desarrollo'
    assert [item['title'] for item in entry['ancestors']] == ['Desarrollo', 'Recursos']
    assert data['recent_studying'] == []
    assert data['structure']['entries_total'] == 3
    assert not data['structure']['directory_truncated']


def test_directory_is_bounded_and_handles_parent_cycles(auth_client, monkeypatch):
    index = {str(i): {'title': f'Página {i}', 'type': 'page'} for i in range(125)}
    index['0']['parent_id'] = '1'
    index['1']['parent_id'] = '0'
    monkeypatch.setattr(app_module, 'load_index', lambda: index)
    monkeypatch.setattr(app_module, 'load_activity', lambda: {'studying': [], 'recent': []})
    context, sources = atlas_context(app_module.__dict__, 'hola')
    structure = json.loads(context)['structure']
    assert len(structure['entries']) == 120
    assert structure['directory_truncated']
    assert structure['entries_total'] == 125
    assert sources == []


def test_retrieved_credentials_are_masked_without_changing_notes(auth_client, monkeypatch):
    monkeypatch.setattr(app_module, 'load_index', lambda: {'keys': {'title': 'APIs', 'type': 'page'}})
    folder = app_module.KNOWLEDGE_DIR / 'pages'
    folder.mkdir()
    path = folder / 'keys.md'
    secret = 'gsk_' + 'x' * 32
    path.write_text('API Groq: ' + secret)
    context, _ = atlas_context(app_module.__dict__, 'APIs')
    assert secret not in context
    assert '[CREDENCIAL OCULTA]' in context
    assert secret in path.read_text()


def test_atlas_context_injected_and_sources_saved(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    monkeypatch.setattr(app_module, 'load_index', lambda: {'note': {'title': 'Mi nota sobre minmax', 'type': 'page'}})
    monkeypatch.setattr(app_module, 'load_activity', lambda: {'studying': [], 'recent': [{'id': 'note', 'ts': 1000}]})
    conversation_id = create(auth_client)
    route = f'/api/assistant/conversations/{conversation_id}'
    response = auth_client.post(route + '/messages', json={'prompt': '¿Qué tengo de minmax?'})
    assert 'event: done' in response.get_data(as_text=True)
    assert 'Mi nota sobre minmax' in captured[0][0]
    saved = auth_client.get(route).json
    assert saved['messages'][-1]['sources'][0]['id'] == 'note'


def test_explicit_page_context_reads_saved_content_without_unrelated_atlas(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    index = {'note': {'title': 'Página elegida', 'type': 'page'},
             'other': {'title': 'Nota ajena', 'type': 'page'},
             'child': {'title': 'Subpágina', 'type': 'page', 'parent_id': 'note'}}
    monkeypatch.setattr(app_module, 'load_index', lambda: index)
    monkeypatch.setattr(app_module, 'load_activity', lambda: {'recent': [{'id': 'other'}], 'studying': []})
    folder = app_module.KNOWLEDGE_DIR / 'pages'
    folder.mkdir()
    (folder / 'note.md').write_text('Contenido guardado específico para resumir.')
    route = '/api/assistant/conversations/' + create(auth_client) + '/messages'
    response = auth_client.post(route, json={'prompt': 'Resume esto', 'use_atlas': False,
                                            'current_context': {'type': 'entry', 'id': 'note', 'title': 'Título falso'}})
    assert 'event: done' in response.get_data(as_text=True)
    system = captured[0][0]
    assert 'Contenido guardado específico' in system
    assert 'Subpágina' in system
    assert 'Nota ajena' not in system
    assert 'Título falso' not in system


def test_current_board_context_includes_columns_and_tasks(auth_client, monkeypatch):
    app_module.KANBAN_FILE.write_text(json.dumps({'boards': {'board': {'id': 'board', 'name': 'Proyecto',
        'columns': [{'name': 'En curso', 'cards': [{'title': 'Terminar página', 'description': 'Revisar diseño'}]}]}}}))
    data = json.loads(atlas_context(app_module.__dict__, 'Resume esto', {'type': 'board', 'id': 'board'})[0])
    assert data['current_context']['title'] == 'Proyecto'
    assert data['current_context']['columns'][0]['cards'][0]['description'] == 'Revisar diseño'


def test_invalid_current_context_is_rejected_before_saving(auth_client):
    route = '/api/assistant/conversations/' + create(auth_client)
    for current in ['note', {'type': 'entry', 'id': []}, {'type': 'unsupported', 'id': 'note'}]:
        assert auth_client.post(route + '/messages', json={'prompt': 'Hola', 'current_context': current}).status_code == 400
    assert auth_client.get(route).json['messages'] == []


def test_current_context_does_not_read_paths_outside_knowledge_root(auth_client, monkeypatch, tmp_path):
    monkeypatch.setattr(app_module, 'load_index', lambda: {'escape': {'title': 'minmax', 'type': 'page'}})
    outside = tmp_path / 'private.txt'
    outside.write_text('private contents must not reach a model')
    monkeypatch.setattr(app_module, '_entry_path', lambda *args: outside)
    context, sources = atlas_context(app_module.__dict__, 'minmax')
    assert 'private contents' not in context


def test_summary_failure_preserves_full_history(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    conversation_id = create(auth_client)
    route = f'/api/assistant/conversations/{conversation_id}'
    record = auth_client.get(route).json
    record['messages'] = [{'role': 'user', 'content': f'Turno {i}'} for i in range(26)]
    with sqlite3.connect(app_module.DATA_DIR / 'assistant.db') as db:
        db.execute('UPDATE conversations SET payload=? WHERE id=?', (json.dumps(record), conversation_id))
    monkeypatch.setattr(app_module, '_call_ai', lambda *args, **kwargs: (None, ('error', 503)))
    response = auth_client.post(route + '/messages', json={'prompt': 'Continuemos', 'use_atlas': False})
    assert 'event: error' in response.get_data(as_text=True)
    saved = auth_client.get(route).json
    assert len(saved['messages']) == 27
    assert saved['memory_through'] == 0
    assert not captured


def test_selection_survives_followups_and_history(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    conversation = create(auth_client)
    selection = {'text': 'git reset --soft HEAD~1', 'title': 'Reset y sus tres modos'}
    response = auth_client.post(f'/api/assistant/conversations/{conversation}/messages', json={
        'prompt': 'Explícame el fragmento.', 'selection_context': selection,
        'provider': 'deepseek', 'model': 'deepseek-v4-pro', 'use_atlas': False,
    })
    assert 'event: done' in response.get_data(as_text=True)
    history = auth_client.get(f'/api/assistant/conversations/{conversation}').json
    assert history['messages'][0]['selection_context'] == selection
    assert history['messages'][0]['question'] == 'Explícame el fragmento.'
    assert selection['text'] in captured[0][1][0]['content']
    assert set(captured[0][1][0]) == {'role', 'content'}
    followup = auth_client.post(f'/api/assistant/conversations/{conversation}/messages', json={
        'prompt': '¿Y el staging?', 'provider': 'deepseek', 'model': 'deepseek-v4-pro', 'use_atlas': False,
    })
    assert 'event: done' in followup.get_data(as_text=True)
    assert selection['text'] in captured[1][1][0]['content']
    assert len(captured[1][1]) == 3
    assert all(set(item) == {'role', 'content'} for item in captured[1][1])


def test_selection_validation_does_not_write_message(auth_client):
    conversation = create(auth_client)
    for selection in ['text', {'text': '', 'title': 'Página'}, {'text': 'x' * 10001, 'title': 'Página'}, {'text': 'Hola', 'title': []}]:
        response = auth_client.post(f'/api/assistant/conversations/{conversation}/messages', json={
            'prompt': 'Explica', 'selection_context': selection,
        })
        assert response.status_code == 400
    assert auth_client.get(f'/api/assistant/conversations/{conversation}').json['messages'] == []


def test_rename_is_persistent_and_preserves_messages(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    conversation = create(auth_client)
    url = f'/api/assistant/conversations/{conversation}'
    assert auth_client.patch(url, json={'title': '  Curso de Git  '}).json['title'] == 'Curso de Git'
    for title in ['', 'x' * 101, 5]:
        assert auth_client.patch(url, json={'title': title}).status_code == 400
    response = auth_client.post(url + '/messages', json={'prompt': 'Explícame reset', 'provider': 'deepseek', 'model': 'deepseek-v4-pro', 'use_atlas': False})
    assert 'event: done' in response.get_data(as_text=True)
    saved = auth_client.get(url).json
    assert saved['title'] == 'Curso de Git'
    assert saved['messages'][1]['provider'] == 'deepseek'
    assert saved['messages'][1]['model'] == 'deepseek-v4-pro'
    assert len(saved['messages']) == 2


def test_failed_answer_retry_does_not_duplicate_question(auth_client, monkeypatch):
    monkeypatch.setenv('DEEPSEEK_API_KEY', 'test-key')
    conversation = create(auth_client)
    url = f'/api/assistant/conversations/{conversation}'
    def invalid(*args, **kwargs):
        yield 'User Safety: safe Response Safety: safe'
        yield ('__done__', False, None)
    monkeypatch.setattr(app_module, '_stream_call_ai', invalid)
    body = {'prompt': 'Explícame subgrid', 'provider': 'deepseek', 'model': 'deepseek-v4-pro', 'use_atlas': False}
    failed = auth_client.post(url + '/messages', json=body).get_data(as_text=True)
    assert 'event: error' in failed
    assert 'event: done' not in failed
    assert len(auth_client.get(url).json['messages']) == 1
    assert auth_client.post(url + '/messages', json={**body, 'prompt': 'Otra pregunta', 'retry': True}).status_code == 409
    captured = []
    setup_model(monkeypatch, captured)
    good = auth_client.post(url + '/messages', json={**body, 'retry': True, 'model': 'deepseek-v4-flash'})
    assert 'event: done' in good.get_data(as_text=True)
    assert len(auth_client.get(url).json['messages']) == 2
    assert captured[0][2]['model'] == 'deepseek-v4-flash'


def test_current_view_is_included_even_in_greeting_and_uses_known_title(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    route = '/api/assistant/conversations/' + create(auth_client) + '/messages'
    response = auth_client.post(route, json={'prompt': 'Hola', 'use_atlas': False,
        'current_context': {'type': 'view', 'id': 'libraryView', 'title': 'Inventado', 'excerpt': 'Tus libros: Java'}})
    assert response.status_code == 200
    assert 'event: done' in response.get_data(as_text=True)
    context = json.loads(captured[0][0].split('\n')[-1])['current_context']
    assert context['title'] == 'Biblioteca'
    assert context['excerpt'] == 'Tus libros: Java'
    assert 'Tiene prioridad sobre las visitas anteriores' in captured[0][0]


def test_current_map_is_loaded_without_query_match(auth_client):
    for kind, filename in [('mindmap', app_module.MINDMAPS_FILE), ('conceptmap', app_module.CONCEPT_MAPS_FILE)]:
        filename.write_text(json.dumps({'maps': {'selected': {'id': 'selected', 'title': 'Mapa actual',
            'nodes': [{'id': 'one', 'text': 'Concepto visible'}]}}}))
        context, sources = atlas_context(app_module.__dict__, 'Dónde estamos', {'type': kind, 'id': 'selected'})
        current = json.loads(context)['current_context']
        assert current['title'] == 'Mapa actual'
        assert 'Concepto visible' in current['excerpt']
        assert current['content_truncated'] is False
        assert any(source['id'] == 'selected' and source['type'] == kind for source in sources)


def test_invalid_view_context_does_not_save_messages(auth_client):
    route = '/api/assistant/conversations/' + create(auth_client)
    for current in [{'type': 'view', 'id': 'unknown'}, {'type': 'view', 'id': 'home', 'excerpt': []},
                    {'type': 'view', 'id': 'home', 'excerpt': 'a' * 8001}]:
        response = auth_client.post(route + '/messages', json={'prompt': 'Dónde estoy', 'current_context': current})
        assert response.status_code == 400
    assert auth_client.get(route).json['messages'] == []
