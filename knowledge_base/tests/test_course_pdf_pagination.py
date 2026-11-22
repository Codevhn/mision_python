"""Continuous numbering is based on real preceding PDFs, never export history."""
import pymupdf
import app as application
import database_export
from course_pagination import preceding_lessons


def lesson(client, course, title, text, module='Módulo 1'):
    response = client.post('/api/courses/entry', json={'course':course, 'module':module, 'title':title, 'raw_text':text})
    assert response.status_code == 200, response.json
    return response.json['id']


def export(client, key, size=10.5):
    response = client.post(f'/api/export/{key}/document', json={'format':'pdf','pdf_font_size':size})
    assert response.status_code == 200, response.json
    return response


def assert_numbers(response, start):
    with pymupdf.open(stream=response.data, filetype='pdf') as pdf:
        for number, page in enumerate(pdf, start):
            footer = [w for w in page.get_text('words') if w[1] > page.rect.height - 55]
            assert len(footer) == 1 and footer[0][4] == str(number)
            assert abs((footer[0][0] + footer[0][2])/2 - page.rect.width/2) < 1
        assert int(response.headers['X-Atlas-PDF-Start-Page']) == start
        assert int(response.headers['X-Atlas-PDF-End-Page']) == start + len(pdf) - 1
        return len(pdf)


def test_course_numbers_follow_size_edits_and_cache_without_mutating_source(auth_client, monkeypatch):
    client = auth_client
    course = client.post('/api/courses', json={'label':'Curso continuo'}).json['id']
    body = '\n\n'.join('Aprender implica comprobar resultados y razonar con ejemplos concretos. ' * 6 for _ in range(16))
    first = lesson(client, course, '1.1 Primera', body)
    second = lesson(client, course, '1.2 Segunda', 'CONTENIDO SEGUNDA')
    third = lesson(client, course, '1.3 Tercera', 'CONTENIDO TERCERA')
    other = client.post('/api/courses', json={'label':'Otro curso'}).json['id']
    lesson(client, other, 'Otra primera', body)
    paths = {key:application._entry_path(key, application.load_index()[key]) for key in (first,second,third)}
    original = {key:path.read_bytes() for key,path in paths.items()}
    # Export the last lesson first: continuity cannot depend on download order.
    last = export(client, third)
    n = assert_numbers(export(client, first), 1)
    assert_numbers(last, n + 2)
    assert_numbers(export(client, second), n + 1)
    calls = []
    render = database_export.render_pdf_layout
    def counted(*args, **kwargs):
        calls.append(True)
        return render(*args, **kwargs)
    monkeypatch.setattr(database_export, 'render_pdf_layout', counted)
    assert_numbers(export(client, third), n + 2)
    assert len(calls) == 1  # Unchanged predecessors use cached counts.
    larger = assert_numbers(export(client, first, 14), 1)
    assert larger > n
    assert_numbers(export(client, second, 14), larger + 1)
    assert {key:path.read_bytes() for key,path in paths.items()} == original
    # Editing a predecessor invalidates its measured count automatically.
    paths[first].write_text(body + '\n\n' + body)
    changed = assert_numbers(export(client, first), 1)
    assert changed > n
    assert_numbers(export(client, second), changed + 1)
    # The legacy direct PDF download uses the same course calculation.
    direct = client.get(f'/api/export/{second}/pdf')
    assert_numbers(direct, changed + 1)
    with pymupdf.open(stream=direct.data, filetype='pdf') as pdf:
        assert 'CONTENIDO SEGUNDA' in pdf[0].get_text()
        assert 'Aprender implica' not in pdf[0].get_text()


def test_predecessors_match_numeric_modules_manual_order_and_exclude_other_courses():
    index = {
        'ten':dict(type='course', course='a', module='ten', module_number='10', order=0),
        'b':dict(type='course', course='a', module='one', module_number='1', order=2),
        'a':dict(type='course', course='a', module='one', module_number='1', order=1),
        'removed':dict(type='course', course='a', module='one', module_number='1', order=0, database_deleted=True),
        'other':dict(type='course', course='b', module='one', module_number='1', order=0),
        'page':dict(type='page'),
    }
    assert preceding_lessons(index, 'ten') == ['a','b']
    assert preceding_lessons(index, 'b') == ['a']
    assert preceding_lessons(index, 'page') == []


def test_one_page_failure_identifies_the_preceding_lesson(auth_client):
    client = auth_client
    course = client.post('/api/courses', json={'label':'Curso con lección extensa'}).json['id']
    lesson(client, course, '1.1 Lección extensa', '\n\n'.join('Un párrafo completo para comprobar la paginación. ' * 8 for _ in range(60)))
    second = lesson(client, course, '1.2 Breve', 'Texto breve.')
    response = client.post(f'/api/export/{second}/document', json={'format':'pdf','pdf_layout':'one_page'})
    assert response.status_code == 422
    assert response.json['code'] == 'pdf_one_page_unavailable'
    assert '1.1 Lección extensa' in response.json['error']
    assert 'Content-Disposition' not in response.headers
