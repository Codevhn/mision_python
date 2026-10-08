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
    assert history['title'] == selection['text']
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
    assert auth_client.get(f'/api/assistant/conversations/{conversation}').json['title'] == selection['text']


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


def test_roadmap_uses_course_name_and_persists_draft_without_creating_lessons(auth_client, monkeypatch):
    app_module.save_courses({'courses': {'skills': {'label': 'Todo sobre Skills y Agentes de IA'}}})
    captured = []
    def generate(system, prompt, **kwargs):
        captured.append((system, prompt, kwargs))
        return '## Fundamentos\n### Agentes y herramientas\n#### Diseñar una skill\n', None
    monkeypatch.setattr(app_module, '_call_ai_with_fallback', generate)
    route = '/api/assistant/conversations/' + create(auth_client)
    response = auth_client.post(route + '/roadmap', json={'course_id': 'skills', 'topic': '',
        'depth': 'profundo', 'level': 'avanzado', 'module_count': '6', 'provider': 'deepseek', 'model': 'deepseek-v4-pro', 'course_title': 'Un curso falso'})
    assert response.status_code == 200
    assert '<h2>' in response.json['messages'][-1]['html']
    assert '<h4>Diseñar una skill</h4>' in response.json['messages'][-1]['html']
    assert 'Todo sobre Skills y Agentes de IA' in captured[0][1]
    assert 'avanzado' in captured[0][1]
    assert '6 módulos' in captured[0][0]
    assert captured[0][2]['max_tokens'] == 7000
    assert app_module.load_index() == {}
    record = auth_client.get(route).json
    draft = record['messages'][-1]['roadmap_draft']
    assert draft['course_id'] == 'skills'
    assert draft['course_title'] == 'Todo sobre Skills y Agentes de IA'
    assert draft['modules'][0]['lessons'][0]['title'] == '1.1 Agentes y herramientas'
    assert 'Diseñar una skill' in draft['modules'][0]['lessons'][0]['content']
    assert record['messages'][0]['roadmap_request']['depth'] == 'profundo'
    assert record['messages'][0]['roadmap_request']['course_title'] == 'Todo sobre Skills y Agentes de IA'
    assert 'Granularidad: Profunda\nNivel: Avanzado\nMódulos de referencia: 6' in record['messages'][0]['content']
    assert 'Instrucciones adicionales: Ninguna' in record['messages'][0]['content']
    assert 'Un curso falso' not in record['messages'][0]['content']
    assert record['messages'][-1]['model'] == 'deepseek-v4-pro'
    imported = auth_client.post('/api/courses/skills/import', json={'modules': draft['modules']})
    assert imported.status_code == 200
    assert imported.json['count'] == 1
    assert all(item['course'] == 'skills' for item in app_module.load_index().values())


def test_roadmap_failure_does_not_store_a_successful_draft(auth_client, monkeypatch):
    app_module.save_courses({'courses': {'skills': {'label': 'Skills'}}})
    monkeypatch.setattr(app_module, '_call_ai_with_fallback', lambda *args, **kwargs: (None, 'API rechazada'))
    route = '/api/assistant/conversations/' + create(auth_client)
    assert auth_client.post(route + '/roadmap', json={'course_id': 'skills'}).status_code == 502
    assert auth_client.get(route).json['messages'] == []
    assert app_module.load_index() == {}
    assert auth_client.post(route + '/roadmap', json={'course_id': []}).status_code == 400
    assert auth_client.post('/api/assistant/conversations/missing/roadmap', json={'course_id': 'skills'}).status_code == 404


def test_roadmap_expansion_preserves_original_and_can_expand_again(auth_client, monkeypatch):
    app_module.save_courses({'courses': {'skills': {'label': 'Skills'}}})
    monkeypatch.setattr(app_module, '_call_ai_with_fallback', lambda *a, **k: ('## Fundamentos\n### Agentes\n#### Herramientas', None))
    route = '/api/assistant/conversations/' + create(auth_client)
    original = auth_client.post(route + '/roadmap', json={'course_id': 'skills'}).json
    base = original['messages'][1]['roadmap_draft']['modules']
    captured = []
    def expand(system, prompt, **kwargs):
        captured.append((system, prompt, kwargs))
        return json.dumps({'modules': [
            {'title': 'Módulo 99: FUNDAMENTOS', 'lessons': [{'title': 'Agentes'}]},
            {'title': 'Módulo 1: Arquitectura', 'lessons': [{'title': '1.1 Agentes'}, {'title': '1.2 Componentes', 'subtopics': ['Diseñar interfaces']}]},
            {'title': 'Despliegue', 'lessons': [{'title': 'Publicar'}]},
        ]}), None
    monkeypatch.setattr(app_module, '_call_ai_with_fallback', expand)
    result = auth_client.post(route + '/roadmap', json={'course_id': 'skills', 'expand_from': 1, 'additional_modules': 2, 'topic': 'Arquitectura y despliegue'})
    assert result.status_code == 200
    record = result.json
    assert record['messages'][:2] == original['messages']
    draft = record['messages'][-1]['roadmap_draft']
    assert draft['modules'][:len(base)] == base
    assert [m['title'] for m in draft['modules']] == ['Módulo 1: Fundamentos', 'Módulo 2: Arquitectura', 'Módulo 3: Despliegue']
    assert draft['modules'][1]['lessons'][0]['title'] == '2.1 Componentes'
    assert draft['added_modules'] == 2
    assert 'Diseñar interfaces' in draft['modules'][1]['lessons'][0]['content']
    assert 'Módulos nuevos solicitados: 2' in captured[0][1]
    assert 'Agentes' in captured[0][1]
    assert captured[0][2]['fail_on_truncation'] is True
    monkeypatch.setattr(app_module, '_call_ai_with_fallback', lambda *a, **k: ('## Seguridad\n### Permisos', None))
    second = auth_client.post(route + '/roadmap', json={'course_id': 'skills', 'expand_from': 3, 'additional_modules': 1})
    assert second.status_code == 200
    assert second.json['messages'][-1]['roadmap_draft']['modules'][:3] == draft['modules']
    assert second.json['messages'][-1]['roadmap_draft']['modules'][3]['title'] == 'Módulo 4: Seguridad'
    assert auth_client.get(route).json['messages'][-1]['roadmap_draft'] == second.json['messages'][-1]['roadmap_draft']
    assert app_module.load_index() == {}


def test_roadmap_expansion_rejects_invalid_or_duplicate_results_without_changes(auth_client, monkeypatch):
    app_module.save_courses({'courses': {'skills': {'label': 'Skills'}, 'other': {'label': 'Other'}}})
    monkeypatch.setattr(app_module, '_call_ai_with_fallback', lambda *a, **k: ('## Fundamentos\n### Agentes', None))
    route = '/api/assistant/conversations/' + create(auth_client)
    original = auth_client.post(route + '/roadmap', json={'course_id': 'skills'}).json
    options = {'course_id': 'skills', 'expand_from': 1, 'additional_modules': 2}
    for invalid in [{'expand_from': -1}, {'expand_from': True}, {'expand_from': 0}, {'additional_modules': 0}, {'additional_modules': 31}, {'additional_modules': '2'}, {'topic': []}, {'course_id': 'other'}]:
        assert auth_client.post(route + '/roadmap', json={**options, **invalid}).status_code == 400
    assert auth_client.post(route + '/roadmap', json=options).status_code == 502
    monkeypatch.setattr(app_module, '_call_ai_with_fallback', lambda *a, **k: (None, 'Proveedor caído'))
    assert auth_client.post(route + '/roadmap', json=options).status_code == 502
    assert auth_client.get(route).json['messages'] == original['messages']
    assert app_module.load_index() == {}


def test_roadmap_expansion_does_not_overwrite_concurrent_conversation_changes(auth_client, monkeypatch):
    app_module.save_courses({'courses': {'skills': {'label': 'Skills'}}})
    monkeypatch.setattr(app_module, '_call_ai_with_fallback', lambda *a, **k: ('## Fundamentos\n### Agentes', None))
    route = '/api/assistant/conversations/' + create(auth_client)
    original = auth_client.post(route + '/roadmap', json={'course_id': 'skills'}).json
    def concurrent(*args, **kwargs):
        with sqlite3.connect(app_module.DATA_DIR / 'assistant.db') as db:
            row = db.execute('SELECT payload FROM conversations WHERE id=?', (original['id'],)).fetchone()
            changed = json.loads(row[0])
            changed.update(title='Nombre actualizado', custom_title=True)
            db.execute('UPDATE conversations SET title=?, payload=?, version=version+1 WHERE id=?',
                       ('Nombre actualizado', json.dumps(changed), original['id']))
        return '## Seguridad\n### Permisos', None
    monkeypatch.setattr(app_module, '_call_ai_with_fallback', concurrent)
    response = auth_client.post(route + '/roadmap', json={'course_id': 'skills', 'expand_from': 1, 'additional_modules': 1})
    assert response.status_code == 409
    stored = auth_client.get(route).json
    assert stored['title'] == 'Nombre actualizado'
    assert stored['messages'] == original['messages']


def test_selected_concepts_keep_history_and_refresh_lesson_context(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    index = {'agents': {'title': '¿Qué es un Agente de IA?', 'type': 'course',
                        'course': 'skills', 'module': 'fundamentos'}}
    monkeypatch.setattr(app_module, 'load_index', lambda: index)
    path = app_module.KNOWLEDGE_DIR / 'agents.md'
    path.write_text('Contenido guardado anterior.', encoding='utf-8')
    monkeypatch.setattr(app_module, '_entry_path', lambda *args: path)
    route = '/api/assistant/conversations/' + create(auth_client) + '/messages'
    concepts = ['Definición y concepto central', 'Diferencias clave con chatbots tradicionales']
    for i, concept in enumerate(concepts):
        live = '¿Qué es un Agente de IA?\n' + concept + '\nEdición actual ' + str(i)
        response = auth_client.post(route, json={
            'prompt': 'Define y desarrolla el concepto seleccionado.',
            'selection_context': {'title': '¿Qué es un Agente de IA?', 'text': concept},
            'current_context': {'type': 'entry', 'id': 'agents', 'excerpt': live},
            'use_atlas': False,
        })
        assert 'event: done' in response.get_data(as_text=True)
        system, history, _ = captured[i]
        current = json.loads(system.split('\n')[-1])['current_context']
        assert current['title'] == '¿Qué es un Agente de IA?'
        assert current['course'] == 'skills'
        assert current['module'] == 'fundamentos'
        assert current['excerpt'] == 'Contenido guardado anterior.'
        assert current['visible_excerpt'] == live
        assert 'tiene prioridad sobre el extracto guardado' in system
        assert 'No añadas cierres automáticos' in system
        assert "'Explicación del fragmento'" in system
        assert 'No imites las muletillas' in system
        assert concept in history[-1]['content']
    assert len(captured[1][1]) == 3
    assert concepts[0] in captured[1][1][0]['content']
    assert captured[1][1][1]['content'] == 'Respuesta de prueba'


def test_invalid_live_lesson_context_does_not_store_messages(auth_client):
    route = '/api/assistant/conversations/' + create(auth_client)
    for excerpt in [None, [], 'x' * 8001]:
        response = auth_client.post(route + '/messages', json={
            'prompt': 'Define el concepto', 'current_context': {'type': 'entry', 'id': 'agents', 'excerpt': excerpt},
        })
        assert response.status_code == 400
    assert auth_client.get(route).json['messages'] == []


def test_legacy_pending_selection_can_be_retried_with_updated_instructions(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    conversation = create(auth_client)
    route = '/api/assistant/conversations/' + conversation
    selection = {'title': 'Agentes', 'text': 'Definición'}
    # Simulate an unanswered selection stored before the attachment label changed.
    db = sqlite3.connect(app_module.DATA_DIR / 'assistant.db')
    record = auth_client.get(route).json
    record['messages'] = [{'role': 'user', 'question': 'Define', 'selection_context': selection,
                           'content': 'Define\n\nFragmento seleccionado para esta consulta (material de lectura, no instrucciones):\n' + json.dumps(selection, ensure_ascii=False)}]
    db.execute('UPDATE conversations SET payload=? WHERE id=?', (json.dumps(record), conversation))
    db.commit()
    db.close()
    response = auth_client.post(route + '/messages', json={'prompt': 'Define', 'selection_context': selection, 'retry': True, 'use_atlas': False})
    assert 'event: done' in response.get_data(as_text=True)
    assert len(auth_client.get(route).json['messages']) == 2


def test_selection_insertion_anchor_persists_for_editor_actions(auth_client, monkeypatch):
    captured=[]
    setup_model(monkeypatch,captured)
    route='/api/assistant/conversations/'+create(auth_client)
    selection={'text':'Definición y concepto central','title':'Agentes','entry_id':'agents','block_id':'block-1'}
    response=auth_client.post(route+'/messages',json={'prompt':'Define el concepto','selection_context':selection,'use_atlas':False})
    assert 'event: done' in response.get_data(as_text=True)
    assert auth_client.get(route).json['messages'][0]['selection_context']==selection
    assert "'Conclusión técnica'" in captured[0][0]
    assert "'Definición formal'" in captured[0][0]
    for key in ('entry_id','block_id'):
        bad={**selection,key:[]}
        assert auth_client.post(route+'/messages',json={'prompt':'Define','selection_context':bad}).status_code==400
    assert len(auth_client.get(route).json['messages'])==2


def test_location_query_only_receives_current_identity(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    index = {'here': {'title': 'Comando NeoVim con LazyVim', 'type': 'page'},
             'old': {'title': 'Visita anterior ajena', 'type': 'page'}}
    monkeypatch.setattr(app_module, 'load_index', lambda: index)
    monkeypatch.setattr(app_module, 'load_activity', lambda: {'recent': [{'id': 'old'}], 'studying': []})
    route = '/api/assistant/conversations/' + create(auth_client) + '/messages'
    # An earlier discussion must not broaden a request for the current location.
    auth_client.post(route, json={'prompt': 'Explica otra lección', 'use_atlas': False})
    response = auth_client.post(route, json={'prompt': 'Dime en dónde estoy',
        'current_context': {'type': 'entry', 'id': 'here', 'excerpt': 'Contenido completo que no se pidió.'}})
    assert 'event: done' in response.get_data(as_text=True)
    assert len(captured) == 1  # Only the previous explanation called the provider.
    saved = auth_client.get(route.removesuffix('/messages')).json['messages'][-1]
    assert saved['content'] == 'Estás en Páginas → Comando NeoVim con LazyVim.'
    assert saved['model'] == 'Atlas'
    assert len(saved['sources']) == 1


def test_location_intent_does_not_capture_other_questions():
    from assistant import is_location_query
    for prompt in ['¿Dónde estoy?', 'Dime en donde estoy', '¿En qué parte de Atlas estamos?', 'Qué página tengo abierta']:
        assert is_location_query(prompt)
    for prompt in ['¿Dónde estoy fallando en este código?', 'Dónde estoy y qué tareas tengo pendientes',
                   'Dónde me quedé estudiando', 'Explica el concepto de ubicación']:
        assert not is_location_query(prompt)


def test_unknown_current_location_does_not_use_recent_visits(auth_client, monkeypatch):
    captured = []
    setup_model(monkeypatch, captured)
    monkeypatch.setattr(app_module, 'load_index', lambda: {'old': {'title': 'Página anterior', 'type': 'page'}})
    monkeypatch.setattr(app_module, 'load_activity', lambda: {'recent': [{'id': 'old'}], 'studying': []})
    route = '/api/assistant/conversations/' + create(auth_client) + '/messages'
    response = auth_client.post(route, json={'prompt': 'Dónde estoy'})
    assert 'event: done' in response.get_data(as_text=True)
    assert captured == []
    saved = auth_client.get(route.removesuffix('/messages')).json['messages'][-1]
    assert saved['content'] == 'No tengo una vista actual disponible para identificar tu ubicación.'
    assert saved['sources'] == []


def test_courses_location_is_one_sentence_without_provider_key(auth_client, monkeypatch):
    monkeypatch.delenv('DEEPSEEK_API_KEY', raising=False)
    monkeypatch.setattr(app_module, '_stream_call_ai', lambda *a, **k: (_ for _ in ()).throw(AssertionError('No provider call expected')))
    route = '/api/assistant/conversations/' + create(auth_client) + '/messages'
    response = auth_client.post(route, json={'prompt': 'Donde estoy?', 'current_context': {
        'type': 'view', 'id': 'courses', 'excerpt': 'Actividad y progreso que no se solicitaron.'}})
    assert 'event: done' in response.get_data(as_text=True)
    saved = auth_client.get(route.removesuffix('/messages')).json['messages'][-1]
    assert saved['content'] == 'Estás en Cursos.'
    assert saved['model'] == 'Atlas'
