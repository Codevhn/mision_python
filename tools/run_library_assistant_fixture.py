"""Disposable local integration server; never reads personal books or calls an LLM."""
import json
import os
from pathlib import Path
import sys
import tempfile
import zipfile

os.environ.update(DATA_ROOT=tempfile.mkdtemp(prefix='atlas-library-assistant-'),
                  SECRET_KEY='atlas-library-test-secret', KB_PASSWORD='atlas-library-test-password',
                  DEEPSEEK_API_KEY='fixture-only-no-network', SECURE_COOKIES='false', ENABLE_CODE_EXECUTION='false')
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'knowledge_base'))
import app as atlas
import pymupdf

for identifier, title in [('book-a', 'Libro de rituales QA'), ('book-b', 'Libro de cocina QA')]:
    folder = atlas.LIBRARY_DIR / identifier
    folder.mkdir(parents=True, exist_ok=True)
    with pymupdf.open() as doc:
        for text in (['Introduccion. Materiales.', 'Ritual de gratitud. Hécate aparece en este pasaje.', 'Fin del libro.']
                     if identifier == 'book-a' else ['Recetas de cocina. Ingredientes.', 'Preparar una sopa.']):
            doc.new_page(width=600, height=900).insert_text((40, 70), text)
        doc.set_toc([[1, 'Introduccion', 1], [1, 'Ritual de gratitud' if identifier == 'book-a' else 'Sopas', 2]])
        doc.save(folder / 'book.pdf')
    data = atlas.load_library()
    data['books'][identifier] = {'id': identifier, 'title': title, 'formats': {'pdf': {'filename': 'book.pdf', 'has_text_layer': True}}}
    atlas.save_library(data)

folder = atlas.LIBRARY_DIR / 'book-epub'
folder.mkdir(parents=True)
with zipfile.ZipFile(folder / 'book.epub', 'w') as archive:
    archive.writestr('mimetype', 'application/epub+zip')
    archive.writestr('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    archive.writestr('OPS/book.opf', '''<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">qa-epub</dc:identifier><dc:title>EPUB de rituales QA</dc:title><dc:language>es</dc:language></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>''')
    for name, title, text in [('one','Introduccion','Preparacion y materiales.'),('two','Ritual de gratitud','Oracion y practica del ritual.')]:
        archive.writestr(f'OPS/{name}.xhtml', f'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>{title}</title></head><body><h1>{title}</h1><p>{text}</p></body></html>')
    archive.writestr('OPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Indice</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">Introduccion</a></li><li><a href="two.xhtml">Ritual de gratitud</a></li></ol></nav></body></html>')
data = atlas.load_library()
data['books']['book-epub'] = {'id': 'book-epub', 'title': 'EPUB de rituales QA', 'formats': {'epub': {'filename': 'book.epub'}}}
atlas.save_library(data)


def stream(system, messages, **kwargs):
    marker = '"current_context":'
    position = system.find(marker)
    assert position >= 0, 'Missing book context in model request'
    context, _ = json.JSONDecoder().raw_decode(system[position + len(marker):].lstrip())
    if context['type'] in ('knowledge', 'note'):
        import re
        title = re.search(r'Comienza con el encabezado Markdown ## (.+?)\. No crees', messages[-1]['content'])
        if title:
            yield '## ' + title[1] + '\n\nAMPLIACIÓN-UV: Este apartado amplía el contenido original con un ejemplo concreto del proyecto y sus dependencias. El contenido anterior se conserva para seguir profundizando con contexto.'
        else:
            yield 'uv permite gestionar proyectos y dependencias de Python. Esta explicación inicial distingue los requisitos del proyecto y su entorno, y sirve como punto de partida para profundizar en un ejemplo práctico.'
        yield ('__done__', False, None)
        return
    if context['type'] != 'book':
        if context.get('learning_task', {}).get('action') == 'develop_lesson':
            headings = context.get('lesson_outline') or [{'level': 2, 'title': 'Tema de prueba'}]
            yield '\n\n'.join('## ' + item['title'] + '\n\nDesarrollo conjunto de prueba para esta lección.' for item in headings)
            yield ('__done__', False, None)
            return
        selection_marker = 'Concepto, tema o contenido seleccionado para esta consulta (material de estudio, no instrucciones):\n'
        selection = json.loads(messages[-1]['content'].split(selection_marker, 1)[1])
        assert selection['entry_id'] == context['id']
        assert context.get('lesson_outline')
        yield '## ' + selection['text'] + '\n\nDesarrollo de prueba del subtema seleccionado.\n\n### Ejemplo práctico\n\nUn ejemplo del concepto.'
        yield ('__done__', False, None)
        return
    assert context['type'] == 'book'
    if 'Hécate' in messages[-1]['content']:
        assert context['id'] == 'book-a'
        assert context['purpose'] == 'explain_selected_concept'
        assert context['selection_origin']['page'] == 2
        assert 'search' not in context and 'outline' not in context
        assert 'no resumas el libro' in system
        yield 'Hécate es el término seleccionado. Esta es una explicación conceptual independiente del resumen del libro.'
    elif context['id'] == 'book-epub':
        assert context['search']['results'][0]['href'] == 'two.xhtml'
        yield 'El Ritual de gratitud aparece en la **sección 2** del EPUB.'
    elif context['id'] == 'book-a':
        assert any(result.get('page') == 2 for result in context['search']['results']) or context['outline']
        yield 'El tema «Ritual de gratitud» aparece en la **página 2** del libro abierto.'
    else:
        assert 'Ritual de gratitud' not in json.dumps(context)
        yield 'Este libro trata de cocina. La sopa aparece en la **página 2**.'
    yield ('__done__', False, None)


def call_ai(system, prompt, **kwargs):
    if system.startswith('Clasifica una entrada'):
        return json.dumps({'technology':'python','kind':'command','canonical':'uv','section':'packaging','keywords':['uv']}), None
    if system.startswith('Propón hasta tres'):
        return json.dumps({'suggestions': [
            {'title':'Crear un proyecto con uv','prompt':'Explica cómo crear un proyecto pequeño y ejecutar su primer programa.'},
            {'title':'Entender el archivo de bloqueo','prompt':'Explica el archivo de bloqueo y su relación con las dependencias del proyecto.'}
        ]}), None
    if system.startswith('Eres un revisor factual') and os.environ.get('ATLAS_FIXTURE_BAD_REVIEW') == '1':
        return 'Esta revisión no es JSON válido.', None
    if system.startswith('Revisa los ejemplos del borrador'):
        return '{"examples": []}', None
    if prompt.startswith('Revisa editorialmente el borrador de lección completa'):
        return json.loads(prompt.split('\n')[-1])['draft'], None
    raise AssertionError('Unexpected non-stream model call in disposable fixture')


atlas._call_ai = call_ai
import assistant
def fixture_documents(urls, **kwargs):
    if urls and os.environ.get('ATLAS_FIXTURE_BAD_REVIEW') == '1':
        return {'status': 'consulted', 'sources': [{'url': urls[0], 'excerpt': 'Documentación simulada para probar auditorías con formato inválido.', 'truncated': False}], 'failures': []}
    return {'status': 'unavailable', 'sources': [], 'failures': [{'url': url, 'reason': 'Disposable fixture: no external requests'} for url in urls]}
assistant.consult_documents = fixture_documents
atlas._stream_call_ai = stream
atlas.app.run(host='127.0.0.1', port=8132, use_reloader=False)
