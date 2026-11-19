"""Configured document exports: inspect real files in disposable stores."""
import base64
import io
import json
from html.parser import HTMLParser
import zipfile
import pytest
from test_database_workspace import workspace, create
from test_database_export import write_body, nested_fixture
import app as application


def text_of(response, fmt):
    if fmt == 'pdf':
        import fitz
        with fitz.open(stream=response.data, filetype='pdf') as document:
            return '\n'.join(page.get_text() for page in document)
    if fmt == 'html':
        class Body(HTMLParser):
            def __init__(self): super().__init__(); self.parts=[]; self.inside=False
            def handle_starttag(self,tag,attrs):
                if tag=='body':self.inside=True
            def handle_data(self,data):
                if self.inside:self.parts.append(data)
        parser=Body();parser.feed(response.data.decode());return ''.join(parser.parts)
    return response.data.decode()


@pytest.mark.parametrize('fmt', ['pdf', 'html', 'markdown_csv', 'json'])
@pytest.mark.parametrize('record', [True, False])
def test_file_default_and_property_opt_in(workspace, fmt, record):
    client, base, parent = workspace
    title = 'Documento de prueba'
    body = '# '+title+'\n\nContenido exacto.\n\n| Material | Cantidad |\n| --- | --- |\n| Papel | 2 |\n\n```java\nint n = args[0];\n```'
    if record:
        row = create(client, base, title=title, values={'s':'Pendiente', 'n':42})
        key = row['id']; write_body(client, row, body)
        endpoint = base+'/rows/'+key+'/export'
    else:
        key = client.post('/api/entry', json={'entry_type':'page','title':title,'raw_text':body,'already_markdown':True}).json['id']
        assert client.patch('/api/entry/'+key+'/properties', json={'properties':[{'id':'status','name':'Estado','type':'text','value':'Pendiente'}]}).status_code == 200
        endpoint = '/api/export/'+key+'/document'
    before = application.load_index()[key]
    original = application._entry_path(key,before).read_bytes()
    result = client.post(endpoint, json={'format':fmt})
    assert result.status_code == 200, result.json
    assert not zipfile.is_zipfile(io.BytesIO(result.data))
    extension = {'markdown_csv':'.md','html':'.html','pdf':'.pdf','json':'.json'}[fmt]
    assert extension in result.headers['Content-Disposition']
    text = text_of(result, fmt)
    assert 'Contenido exacto' in text and 'Papel' in text and 'args[0]' in text
    assert 'Estado' not in text and 'Pendiente' not in text
    if fmt != 'json': assert text.count(title) == 1
    else:
        assert 'properties' not in result.json['row'] and 'database_properties' not in result.json['row']
    included = client.post(endpoint, json={'format':fmt,'include_properties':True})
    assert included.status_code == 200, included.json
    assert 'Estado' in text_of(included,fmt) and 'Pendiente' in text_of(included,fmt)
    # Opening the same record as a normal page must use the same projection.
    if record:
        normal = client.post('/api/export/'+key+'/document', json={'format':fmt})
        assert normal.status_code == 200
        assert 'Estado' not in text_of(normal,fmt)
    assert application.load_index()[key] == before
    assert application._entry_path(key,before).read_bytes() == original


def test_zip_is_explicit_and_subpages_cannot_disappear_silently(workspace):
    client, base, _ = workspace
    root=create(client,base,title='Principal');write_body(client,root,'Cuerpo principal.')
    child=client.post('/api/entry',json={'entry_type':'page','title':'Hija','parent_id':root['id'],'raw_text':'Contenido hija.','already_markdown':True}).json['id']
    endpoint=base+'/rows/'+root['id']+'/export'
    assert client.post(endpoint,json={'include_subpages':True}).status_code==400
    packed=client.post(endpoint,json={'archive':True,'include_subpages':True,'folders':True,'format':'html'})
    assert packed.status_code==200
    with zipfile.ZipFile(io.BytesIO(packed.data)) as archive:
        manifest=json.loads(archive.read('manifest.json'))
        assert {page['id'] for page in manifest['pages']}=={root['id'],child}
        assert manifest['options']['include_properties'] is False
        assert 'Estado' not in archive.read(manifest['entrypoint']).decode()
    for key in ('include_properties','archive'):
        for value in ('false',0,None,[]):
            assert client.post(endpoint,json={key:value}).status_code==400


@pytest.mark.parametrize('fmt',['html','pdf','markdown_csv','json'])
def test_single_file_keeps_media_without_requiring_sidecar_assets(workspace, fmt):
    client,base,_=workspace;root=create(client,base)
    image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jUZkAAAAASUVORK5CYII=')
    upload=client.post('/api/databases/files',data={'file':(io.BytesIO(image),'pixel.png')},content_type='multipart/form-data').json
    write_body(client,root,'Imagen del documento.\n\n![Pixel]('+upload['url']+')')
    endpoint=base+'/rows/'+root['id']+'/export'
    result=client.post(endpoint,json={'format':fmt})
    assert result.status_code==200,result.json
    if fmt=='pdf':
        import fitz
        with fitz.open(stream=result.data,filetype='pdf') as document:
            assert sum(len(page.get_images()) for page in document)>0
    else:
        assert 'data:image/png;base64,' in result.data.decode()
        assert upload['url'] not in result.data.decode()
    excluded=client.post(endpoint,json={'format':fmt,'include_content':'no_files'})
    assert excluded.status_code==200
    if fmt!='pdf':assert 'data:image/png;base64,' not in excluded.data.decode()


def test_single_document_embedded_database_is_content_not_page_properties(workspace):
    client,base,_,root,*_=nested_fixture(workspace)
    response=client.post(base+'/rows/'+root['id']+'/export',json={'format':'html'})
    assert response.status_code==200,response.json
    html=response.get_data(as_text=True)
    assert '<table' in html and 'Datos CSV' not in html
    assert 'Propiedad</th>' not in html


def test_configured_export_requires_login(client):
    assert client.post('/api/export/missing/document',json={}).status_code in (302,401)


def test_single_pdf_keeps_downloadable_files_as_attachments(workspace):
    client,base,_=workspace;root=create(client,base)
    content=b'Archivo de apoyo exacto.'
    upload=client.post('/api/databases/files',data={'file':(io.BytesIO(content),'apoyo.txt')},content_type='multipart/form-data').json
    write_body(client,root,'Texto conservado.\n\n[Archivo de apoyo]('+upload['url']+')')
    response=client.post(base+'/rows/'+root['id']+'/export',json={'format':'pdf'})
    assert response.status_code==200,response.json
    import fitz
    with fitz.open(stream=response.data,filetype='pdf') as document:
        attachments=[annotation.get_file() for page in document for annotation in page.annots() or [] if annotation.type[1]=='FileAttachment']
        assert attachments==[content]


def test_wrapped_duplicate_title_is_removed_only_on_exact_match(workspace):
    client,base,_=workspace;title='El hechizo para tus seres queridos'
    root=create(client,base,title=title)
    write_body(client,root,'## El hechizo para tus seres\nqueridos\n\nCuerpo real.')
    response=client.post(base+'/rows/'+root['id']+'/export',json={'format':'pdf'})
    assert response.status_code==200
    text=text_of(response,'pdf')
    assert text.count(title)==1 and 'Cuerpo real' in text
    from database_export import export_body_without_title
    body='## Otro encabezado\nqueridos\n\nTexto intacto.'
    assert export_body_without_title(body,title,application._strip_duplicate_heading_md)==body
