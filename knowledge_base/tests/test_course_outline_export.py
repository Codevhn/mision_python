import pytest
import app as atlas
from course_outline import lesson_topics


@pytest.mark.parametrize('body,expected', [
    ('# Lección\n\n## Tema `uv`\n\nExplicación.\n\n### Instalación\n\nCódigo.\n\n## Otro tema\n\nMás contenido.', ['Tema `uv`', 'Otro tema']),
    ('# Lección\n\n### Tema manual\n\n### Segundo', ['Tema manual', 'Segundo']),
    ('## Lección\n\n### Tema\n\nTexto.', ['Tema']),
    ('```python\n## Falso\n```\n\n## Real\n\n> ## Cita\n\n    ## Código indentado', ['Real']),
    ('~~~markdown\n## Falso\n~~~\n\nTexto sin temas.', []),
    ('Tema setext\n-----------\n\nExplicación.', ['Tema setext']),
    ('# Lección\n\n- Tema `uv`\n- Otro tema', ['Tema `uv`', 'Otro tema']),
    ('Introducción desarrollada.\n\n- Paso de un ejemplo\n- Otro paso', []),
    ('## C# y **tipos** ##\n\nTexto.', ['C# y **tipos**']),
    ('# Lección\n\n_Contenido pendiente._', []),
])
def test_extracts_only_roadmap_topics(body, expected):
    assert lesson_topics(body, 'Lección') == expected


def test_export_defaults_to_structure_and_preserves_explicit_full_backup(auth_client):
    course = auth_client.post('/api/courses', json={'label': 'Curso de prueba'}).json['id']
    other = auth_client.post('/api/courses', json={'label': 'Otro curso'}).json['id']
    content = '# 1.1 Bases\n\n## Tema `uv`\n\nPROSA_NO_EXPORTAR.\n\n### Ejemplo desarrollado\n\n```python\n## ENCABEZADO_FALSO\nprint("CODIGO_NO_EXPORTAR")\n```\n\n## Otro tema\n\n| tabla | detalle |\n| --- | --- |\n| NO_EXPORTAR | 42 |'
    ids = []
    for selected, module, title, body in [(course, 'Módulo 1', '1.1 Bases', content),
            (course, 'Módulo 1', '1.2 Manual', '# 1.2 Manual\n\n### Tema manual'),
            (course, 'Módulo 2', '2.1 Pendiente', '# 2.1 Pendiente\n\n_Contenido pendiente._'),
            (other, 'Módulo ajeno', 'No pertenece', '## Tema ajeno')]:
        result = auth_client.post('/api/courses/entry', json={'course': selected, 'module': module, 'title': title, 'raw_text': body})
        assert result.status_code == 200
        ids.append(result.json['id'])
    index_before = atlas.load_index()
    files_before = {str(path): path.read_bytes() for path in atlas.KNOWLEDGE_DIR.rglob('*.md')}
    response = auth_client.get(f'/api/courses/{course}/export/md')
    assert response.status_code == 200
    assert response.mimetype == 'text/markdown'
    assert 'attachment' in response.headers['Content-Disposition']
    text = response.get_data(as_text=True)
    for expected in ['# Curso de prueba', '## Módulo 1', '## Módulo 2', '### 1.1 Bases', '### 1.2 Manual', '### 2.1 Pendiente', '- Tema `uv`', '- Otro tema', '- Tema manual']:
        assert expected in text
    for excluded in ['PROSA_NO_EXPORTAR', 'Ejemplo desarrollado', 'ENCABEZADO_FALSO', 'CODIGO_NO_EXPORTAR', 'NO_EXPORTAR', 'Contenido pendiente', 'Tema ajeno', 'No pertenece']:
        assert excluded not in text
    parsed = atlas._parse_canonical_course_md(text)
    assert [len(module['lessons']) for module in parsed] == [2, 1]
    assert parsed[0]['lessons'][0]['content'] == '- Tema `uv`\n- Otro tema'
    full = auth_client.get(f'/api/courses/{course}/export/md?include_content=1').get_data(as_text=True)
    assert content in full
    assert 'PROSA_NO_EXPORTAR' in full
    assert atlas.load_index() == index_before
    assert {str(path): path.read_bytes() for path in atlas.KNOWLEDGE_DIR.rglob('*.md')} == files_before


def test_export_requires_login_and_existing_course(client, auth_client):
    assert auth_client.get('/api/courses/missing/export/md').status_code == 404
    client.get('/logout')
    assert client.get('/api/courses/missing/export/md').status_code == 401
