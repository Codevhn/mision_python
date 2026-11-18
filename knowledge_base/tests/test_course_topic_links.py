import pytest
from course_topic_links import headings, topic_key


def course(client, label):
    response = client.post('/api/courses', json={'label': label})
    assert response.status_code == 201
    return response.json['id']


def lesson(client, course_id, title, content):
    response = client.post('/api/courses/entry', json={'course': course_id, 'module': 'Módulo 1', 'title': title, 'raw_text': content})
    assert response.status_code == 200
    return response.json['id']


def test_parser_ignores_code_and_normalizes_numbered_inline_headings():
    assert headings('## 1. **Metodología** y `Python`\n\n```python\n# No es título\n```') == ['1. Metodología y Python']
    assert topic_key('1.Metodología y Python') == topic_key('metodologia y Python')
    assert topic_key('3D modelos') == '3d modelos'


def test_unique_sections_course_isolation_and_ambiguity(auth_client):
    client = auth_client
    python = course(client, 'Python')
    java = course(client, 'Java')
    first = lesson(client, python, 'Metodología y filosofía', '# Metodología y filosofía\n\n## 1.Metodología de aprendizaje técnico\n\nTexto desarrollado.\n\n## 2.Pensamiento lógico\n\nTexto.')
    lesson(client, java, 'Otro curso', '## Metodología de aprendizaje técnico\n\nNo debe elegirse.')
    result = client.post('/api/roadmap/course-topics', json={'course_id': python, 'topics': [{'key': 'a', 'text': 'Metodología de aprendizaje técnico'}, {'key': 'b', 'text': 'No existe'}]})
    assert result.status_code == 200
    data = result.json
    selected = next(t for t in data['targets'] if t['id'] == data['results'][0]['selected'])
    assert selected['entry_id'] == first and selected['heading'] == '1.Metodología de aprendizaje técnico'
    assert all(t['course_id'] == python for t in data['targets'])
    assert data['results'][1]['selected'] is None
    lesson(client, python, 'Segunda lección', '## Metodología de aprendizaje técnico\n\nOtro apartado.')
    result = client.post('/api/roadmap/course-topics', json={'course_id': python, 'topics': [{'key': 'a', 'text': 'Metodología de aprendizaje técnico'}]})
    assert result.json['results'][0]['selected'] is None


def test_destination_validates_heading_occurrence_and_course(auth_client):
    client = auth_client
    selected = course(client, 'Python 2028')
    other = course(client, 'Java 2028')
    entry = lesson(client, selected, 'Lección', '# Lección\n\n## Repetido\n\nUno\n\n## Repetido\n\nDos')
    target = {'entry_id': entry, 'course_id': selected, 'heading': 'Repetido', 'occurrence': 1}
    assert client.post('/api/roadmap/course-topic/validate', json=target).status_code == 200
    assert client.post('/api/roadmap/course-topic/validate', json={**target, 'course_id': other}).status_code == 404
    assert client.post('/api/roadmap/course-topic/validate', json={**target, 'occurrence': 2}).status_code == 409
    assert client.post('/api/roadmap/course-topic/validate', json={**target, 'occurrence': True}).status_code == 400
    assert client.post('/api/roadmap/course-topic/validate', json={**target, 'heading': None}).status_code == 400
    client.patch(f'/api/entry/{entry}/content', json={'already_markdown': True, 'raw_text': '## Cambiado'})
    assert client.post('/api/roadmap/course-topic/validate', json=target).status_code == 409


@pytest.mark.parametrize('payload', [[], {'course_id': 'missing', 'topics': []}, {'course_id': 1, 'topics': []}])
def test_invalid_analysis_is_read_only_and_rejected(auth_client, payload):
    assert auth_client.post('/api/roadmap/course-topics', json=payload).status_code == 400
