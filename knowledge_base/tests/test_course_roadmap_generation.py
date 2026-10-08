import json

import pytest
import app as app_module


@pytest.mark.parametrize('outline', [
    '## Módulo 1: Bases\n### 1.1 Agentes\n#### Herramientas\n#### Memoria\n## Módulo 2: Proyectos\n### 2.1 Construir',
    '  ## Módulo 1: Bases\n  ### 1.1 Agentes\n  #### Herramientas\n  ## Módulo 2: Proyectos\n  ### 2.1 Construir',
    '**Módulo 1: Bases**\n- **1.1 Agentes**\n  - 1.1.1 Herramientas\n**Módulo 2: Proyectos**\n- **2.1 Construir**',
    '**Módulo 1: Bases**\n### 1.1 Agentes\n#### Herramientas\n**Módulo 2: Proyectos**\n### 2.1 Construir',
    json.dumps({'modules': [{'title': 'Bases', 'lessons': [{'title': 'Agentes', 'subtopics': ['Herramientas']}]}, {'title': 'Proyectos', 'lessons': ['Construir']}]}),
    '```json\n' + json.dumps({'modulos': [{'titulo': 'Bases', 'lecciones': [{'titulo': 'Agentes', 'subtemas': ['Herramientas']}]}, {'titulo': 'Proyectos', 'lecciones': ['Construir']}]}) + '\n```',
])
def test_supported_formats_preserve_modules_lessons_and_subtopics(outline):
    modules = app_module._parse_generated_course_roadmap(outline)
    assert len(modules) == 2
    assert [len(module['lessons']) for module in modules] == [1, 1]
    assert 'Agentes' in modules[0]['lessons'][0]['title']
    assert 'Herramientas' in modules[0]['lessons'][0]['content']
    assert 'Construir' in modules[1]['lessons'][0]['title']


@pytest.mark.parametrize('outline', ['', 'User Safety: safe\nResponse Safety: safe',
    '{"modules":[{"title":"Bases","lessons":[]}]}',
    '{"modules":[{"title":"Bases","lessons":[{"title":5}]}]}',
    'Un curso sobre agentes se puede organizar de muchas formas.'])
def test_unusable_response_does_not_invent_a_roadmap(outline):
    assert app_module._parse_generated_course_roadmap(outline) == []


def test_fallback_retries_unusable_successful_response(monkeypatch):
    calls = []
    monkeypatch.setattr(app_module, '_list_available_ai_models', lambda: [('test', 'one'), ('test', 'two')])
    def generate(*args, **kwargs):
        calls.append(kwargs['model'])
        return ('Sin esquema' if len(calls) == 1 else '## Bases\n### Agentes'), None
    monkeypatch.setattr(app_module, '_call_ai', generate)
    content, error = app_module._call_ai_with_fallback('system', 'prompt', provider='test', model='one', content_validator=app_module._parse_generated_course_roadmap)
    assert error is None
    assert content == '## Bases\n### Agentes'
    assert calls == ['one', 'two']


def test_fallback_is_bounded_and_preserves_unusable_response(monkeypatch):
    calls = []
    monkeypatch.setattr(app_module, '_AI_FALLBACK_MAX_ATTEMPTS', 2)
    monkeypatch.setattr(app_module, '_list_available_ai_models', lambda: [('test', str(i)) for i in range(5)])
    def generate(*args, **kwargs):
        calls.append(kwargs['model'])
        return 'Respuesta sin esquema ' + kwargs['model'], None
    monkeypatch.setattr(app_module, '_call_ai', generate)
    content, error = app_module._call_ai_with_fallback('system', 'prompt', content_validator=app_module._parse_generated_course_roadmap)
    assert calls == ['0', '1']
    assert content == 'Respuesta sin esquema 1'
    assert '2 modelos' in error


@pytest.mark.parametrize('error', [None, 'Todos los modelos devolvieron respuestas sin esquema'])
def test_unusable_assistant_response_is_inspectable_without_creating_entries(auth_client, monkeypatch, error):
    app_module.save_courses({'courses': {'skills': {'label': 'Skills'}}})
    raw = 'Respuesta sin esquema <script>alert(1)</script>'
    monkeypatch.setattr(app_module, '_call_ai_with_fallback', lambda *args, **kwargs: (raw, error))
    conversation = auth_client.post('/api/assistant/conversations', json={}).json['id']
    route = '/api/assistant/conversations/' + conversation
    response = auth_client.post(route + '/roadmap', json={'course_id': 'skills'})
    assert response.status_code == 502
    assert response.json['raw_response'] == raw
    assert auth_client.get(route).json['messages'] == []
    assert app_module.load_index() == {}
