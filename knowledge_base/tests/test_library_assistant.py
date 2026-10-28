import json
import zipfile

import pymupdf
import pytest

import app as app_module
import library_context as books
from assistant import atlas_context
from test_assistant import create, setup_model


@pytest.fixture
def library(auth_client, tmp_path, monkeypatch):
    directory = tmp_path / 'library'
    directory.mkdir()
    monkeypatch.setattr(app_module, 'LIBRARY_DIR', directory)
    monkeypatch.setattr(app_module, 'LIBRARY_FILE', tmp_path / 'library.json')
    monkeypatch.setattr(app_module, 'LIBRARY_NOTES_FILE', tmp_path / 'notes.json')
    monkeypatch.setattr(app_module, 'LIBRARY_PROGRESS_FILE', tmp_path / 'progress.json')
    monkeypatch.setattr(app_module, 'LIBRARY_BOOKMARKS_FILE', tmp_path / 'bookmarks.json')
    app_module.save_library({'books': {}})
    return auth_client


def pdf(book_id='book-a', texts=None, outline=True):
    folder = app_module.LIBRARY_DIR / book_id
    folder.mkdir(exist_ok=True)
    with pymupdf.open() as document:
        for text in (texts if texts is not None else ['Introducción y materiales.', 'Ritual de gratitud. Oración y práctica.', 'Conclusiones del libro.']):
            document.new_page().insert_text((40, 60), text)
        if outline and document.page_count >= 2:
            document.set_toc([[1, 'Introducción', 1], [1, 'Ritual de gratitud', 2]])
        document.save(folder / 'book.pdf')
    registry = app_module.load_library()
    registry['books'][book_id] = {'id': book_id, 'title': 'Libro ' + book_id, 'author': 'Autora QA', 'formats': {'pdf': {'filename': 'book.pdf'}}}
    app_module.save_library(registry)
    return {'type': 'book', 'id': book_id, 'format': 'pdf', 'page': 1}


def retrieve(query, context):
    return books.book_context(app_module.__dict__, query, context)


def test_search_cites_real_pages_and_stays_within_the_open_book(library):
    context = pdf()
    pdf('other-book', ['Ritual exclusivo de OTRO LIBRO.'], outline=False)
    result, sources = retrieve('Lista los temas que incluyan "RÍTUAL"', context)
    assert result['index_complete'] is True
    assert result['current_location']['page'] == 1
    assert result['search']['matching_units_total'] == 1
    assert result['search']['results'][0]['page'] == 2
    assert 'Ritual de gratitud' in result['search']['results'][0]['excerpt']
    assert all(source['id'] == 'book-a' for source in sources)
    assert 'OTRO LIBRO' not in json.dumps(result)
    material, atlas_sources = atlas_context(app_module.__dict__, 'Busca "oracion"', context)
    assert json.loads(material)['current_context']['search']['results'][0]['page'] == 2
    assert all(source['type'] == 'book' for source in atlas_sources)
    assert 'matching_notes' not in json.loads(material)


def test_overview_uses_toc_and_reports_real_scope_and_notes(library):
    context = pdf()
    app_module.LIBRARY_NOTES_FILE.write_text(json.dumps({'book-a': [{'quote_text': 'Mi resaltado', 'note_text': 'Recordar', 'location': 'page:2'}]}))
    result, _ = retrieve('¿Cuáles son los temas de este libro?', context)
    assert result['outline'][1]['title'] == 'Ritual de gratitud'
    assert result['outline'][1]['page'] == 2
    assert result['search']['terms'] == []
    assert result['overview_is_sample'] is True
    assert result['saved_notes'][0]['quote'] == 'Mi resaltado'
    assert result['needs_ocr'] is False


def test_index_reused_and_invalidated_after_file_replacement(library, monkeypatch):
    context = pdf()
    retrieve('ritual', context)
    original = books.pdf_units
    calls = []
    def extract(path):
        calls.append(path)
        yield from original(path)
    monkeypatch.setattr(books, 'pdf_units', extract)
    retrieve('ritual', context)
    assert calls == []
    pdf(texts=['Contenido nuevo tras OCR.'], outline=False)
    result, _ = retrieve('ritual', context)
    assert len(calls) == 1
    assert result['search']['matching_units_total'] == 0
    assert 'Contenido nuevo' in result['current_location']['excerpt']


def test_scanned_pdf_missing_files_and_partial_index_are_explicit(library, monkeypatch):
    scanned = pdf('scanned', ['', ''], outline=False)
    result, _ = retrieve('ritual', scanned)
    assert result['needs_ocr'] is True
    assert result['pages_without_text'] == 2
    assert result['search']['matching_units_total'] == 0
    monkeypatch.setattr(books, 'MAX_UNITS', 1)
    context = pdf('limited')
    result, _ = retrieve('ritual', context)
    assert result['index_complete'] is False
    assert result['indexed_units'] == 1
    assert result['total_units'] == 3
    (app_module.LIBRARY_DIR / 'limited' / 'book.pdf').unlink()
    result, sources = retrieve('ritual', context)
    assert result['status'] == 'unavailable'
    assert sources == []


def test_unsafe_registered_filename_cannot_read_outside_book(library):
    context = pdf()
    registry = app_module.load_library()
    registry['books']['book-a']['formats']['pdf']['filename'] = '../outside.pdf'
    app_module.save_library(registry)
    result, sources = retrieve('secret', context)
    assert result['status'] == 'unavailable'
    assert sources == []


def test_result_limits_and_continuation_do_not_hide_match_count(library):
    context = pdf(texts=[f'Ritual en pagina {number}.' for number in range(1, 14)], outline=False)
    first, _ = retrieve('Busca "ritual"', context)
    assert first['search']['matching_units_total'] == 13
    assert len(first['search']['results']) == 8
    assert first['search']['results_truncated'] is True
    assert first['search']['continue_from_unit'] == 9
    second, _ = retrieve('Busca "ritual" desde la página 9', context)
    assert second['search']['results'][0]['page'] == 9
    assert len(second['search']['results']) == 5
    assert second['search']['results_truncated'] is False


def test_literal_word_search_does_not_match_spiritual_or_regex(library):
    context = pdf(texts=['Desarrollo espiritual y rituales.', 'Un RITUAL de gratitud.'], outline=False)
    result, _ = retrieve('Busca "ritual"', context)
    assert result['search']['matching_units_total'] == 1
    assert result['search']['results'][0]['page'] == 2
    result, _ = retrieve('Busca "ritual.*"', context)
    assert result['search']['matching_units_total'] == 0


def test_delete_book_removes_cached_text(library):
    context = pdf()
    retrieve('ritual', context)
    cache = books.cache_path(app_module.__dict__, 'book-a')
    assert cache.exists()
    assert library.delete('/api/library/book-a').status_code == 200
    assert not cache.exists()
    result, sources = retrieve('ritual', context)
    assert result['status'] == 'unavailable'
    assert sources == []


def test_epub_uses_spine_headings_and_real_section_hrefs(library):
    folder = app_module.LIBRARY_DIR / 'epub-book'
    folder.mkdir()
    with zipfile.ZipFile(folder / 'book.epub', 'w') as archive:
        archive.writestr('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>')
        archive.writestr('OPS/book.opf', '<package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="one" href="one.xhtml"/><item id="two" href="two.xhtml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>')
        archive.writestr('OPS/one.xhtml', '<h1>Introducción</h1><p>Preparación del libro.</p>')
        archive.writestr('OPS/two.xhtml', '<h1>Ritual de gratitud</h1><p>Oración en esta sección.</p><script>NO INDEXAR</script>')
    app_module.save_library({'books': {'epub-book': {'title': 'Libro EPUB', 'formats': {'epub': {'filename': 'book.epub'}}}}})
    result, sources = retrieve('Busca "ritual"', {'type': 'book', 'id': 'epub-book', 'format': 'epub', 'href': 'two.xhtml'})
    assert result['current_location']['href'] == 'two.xhtml'
    assert result['current_location']['page'] is None
    assert result['search']['results'][0]['section'] == 2
    assert 'NO INDEXAR' not in json.dumps(result)
    assert any(source['href'] == 'two.xhtml' for source in sources)


def test_stream_delivers_book_context_and_resumes_book_thread(library, monkeypatch):
    context = pdf()
    context.update(excerpt='NO CONFIAR EN TEXTO DEL CLIENTE', title='Título falso')
    captured = []
    setup_model(monkeypatch, captured)
    conversation = create(library)
    response = library.post(f'/api/assistant/conversations/{conversation}/messages', json={
        'prompt': 'Lista los temas que incluyan "ritual"', 'current_context': context, 'use_atlas': False})
    assert response.status_code == 200
    assert 'event: done' in response.get_data(as_text=True)
    assert 'Ritual de gratitud' in captured[0][0]
    assert 'NO CONFIAR EN TEXTO DEL CLIENTE' not in captured[0][0]
    assert 'Título falso' not in captured[0][0]
    record = library.get(f'/api/assistant/conversations/{conversation}').json
    assert record['messages'][0]['study_context']['format'] == 'pdf'
    assert record['messages'][1]['sources']
    assert all(source['type'] == 'book' for source in record['messages'][1]['sources'])
    assert library.get('/api/assistant/conversations/resume?type=book&id=book-a').json['conversation']['id'] == conversation


def test_explain_selection_retrieves_the_term_not_the_generic_instruction(library, monkeypatch):
    context = pdf(texts=['Materiales y preparación.', 'Hécate aparece en el pasaje seleccionado.'], outline=False)
    captured = []
    setup_model(monkeypatch, captured)
    conversation = create(library)
    response = library.post(f'/api/assistant/conversations/{conversation}/messages', json={
        'prompt': 'Explica el término seleccionado y su contexto en el libro abierto.',
        'selection_context': {'text': 'Hécate', 'title': 'Libro de origen'}, 'selection_action': 'explain',
        'current_context': context})
    assert 'event: done' in response.get_data(as_text=True)
    system, messages, _ = captured[0]
    start = system.index('{"current_context":')
    material, _ = json.JSONDecoder().raw_decode(system[start:])
    search = material['current_context']['search']
    assert search['terms'] == ['hecate']
    assert search['results'][0]['page'] == 2
    assert 'Hécate' in messages[-1]['content']
    record = library.get(f'/api/assistant/conversations/{conversation}').json
    assert record['messages'][0]['selection_action'] == 'explain'
    assert record['messages'][0]['selection_context']['text'] == 'Hécate'


@pytest.mark.parametrize('change', [{'format': 'javascript'}, {'page': True}, {'page': -1}, {'href': 12}])
def test_reject_invalid_book_context_before_generation(library, change):
    context = pdf()
    conversation = create(library)
    response = library.post(f'/api/assistant/conversations/{conversation}/messages', json={
        'prompt': 'Resume', 'current_context': {**context, **change}})
    assert response.status_code == 400
