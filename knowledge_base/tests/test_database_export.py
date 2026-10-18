"""Inspect artifacts from isolated stores, never the user's demo or index."""
import csv
import io
import json
import zipfile
from pathlib import Path
import pytest
import app as application

@pytest.fixture(autouse=True)
def isolated_remote_assets(monkeypatch):
    import database_export
    from database_remote_assets import RemoteAssetError
    real=database_export.fetch_remote_asset
    def unavailable(url,*args,**kwargs):
        if url.startswith('http://127.0.0.1:9/'):
            return real(url,*args,**kwargs)  # rejected before DNS/socket access
        raise RemoteAssetError('remote_fetch_failed')
    monkeypatch.setattr(database_export,'fetch_remote_asset',unavailable)


def titled(client, base, title, values=None):
    row=create(client,base,values=values or {})
    result=client.patch(base+'/rows/'+row['id'],json={'title':title})
    assert result.status_code==200
    return result.json['row']
from test_database_workspace import workspace, create, schema_change, A, B


def test_export_filter_contract_matches_shared_browser_cases():
    from database_export import selected_rows
    fixture=json.loads((Path(__file__).parents[1]/'editor-src/test/fixtures/databaseFilters.json').read_text())
    for case in fixture['cases']:
        assert [r['id'] for r in selected_rows(fixture['rows'],{'filters':[case['rule']]})]==case['ids'],case['rule']
    from datetime import datetime
    from database_filters import relative_range
    for case in fixture['tree_cases']:
        now=datetime.fromisoformat(case.get('now','2026-10-19T00:30:00Z'))
        assert [r['id'] for r in selected_rows(case.get('rows',fixture['rows']),case['view'],now)]==case['ids'],case['view']
    for case in fixture['range_cases']:
        assert [d.isoformat() for d in relative_range(case['period'],case['today'])]==case['range']


@pytest.mark.parametrize('fmt',['markdown_csv','html','pdf','json'])
def test_export_keeps_broken_relation_and_computation_diagnostics(workspace,fmt):
    from test_database_relations import related_fixture
    client,base,parent,other,targets,rel,total,count,row=related_fixture(workspace)
    client.delete(other+'/rows/'+targets[0]['id'])
    response=client.post(base+'/rows/'+row['id']+'/export',json={'format':fmt})
    assert response.status_code==200,response.json
    assert int(response.headers['X-Atlas-Export-Property-Issues'])==3
    archive=zipfile.ZipFile(io.BytesIO(response.data));manifest=json.loads(archive.read('manifest.json'))
    assert [p['id'] for p in manifest['pages']]==[row['id']]
    assert len(manifest['property_issues'])==3
    assert next(p for p in manifest['property_issues'] if p['column_id']==rel)['relation_issues'][0]['reason']=='deleted'
    payload=archive.read(manifest['entrypoint'])
    if fmt=='pdf':
        import fitz
        document=fitz.open(stream=payload,filetype='pdf');text='\n'.join(page.get_text() for page in document)
    else:text=payload.decode()
    assert 'Error de cálculo' in text and 'En papelera' in text
    assert 'Cuerpo protegido' in text
    if fmt=='json':
        exported_row=json.loads(payload)['row'];assert next(p['value'] for p in exported_row['properties'] if p['id']==rel)==[targets[0]['id']]


def write_body(client, row, body):
    assert client.patch('/api/entry/' + row['id'] + '/content', json={'raw_text':body, 'already_markdown':True}).status_code == 200


def exported(client, base, row, **options):
    response = client.post(base + '/rows/' + row['id'] + '/export', json=options)
    assert response.status_code == 200, response.json
    assert response.mimetype == 'application/zip' and 'attachment' in response.headers['Content-Disposition']
    archive = zipfile.ZipFile(io.BytesIO(response.data))
    manifest = json.loads(archive.read('manifest.json'))
    return archive, manifest


def test_malformed_remote_image_is_reported_without_aborting_export(workspace):
    client,base,_=workspace
    root=create(client,base)
    write_body(client,root,'Texto conservado\n\n![Imagen](https://[broken/a)')
    archive,manifest=exported(client,base,root)
    assert {'url':'https://[broken/a','reason':'remote_url_invalid'} in manifest['omitted']
    assert 'Texto conservado' in archive.read(manifest['entrypoint']).decode()


def nested_fixture(workspace):
    client, base, parent = workspace
    root = titled(client, base, 'Same/name', values={'n':0, 'text':'Root only'})
    sibling = titled(client, base, 'SECRET PARENT SIBLING', values={'text':'NEVER EXPORT'})
    nested_id = 'db_' + 'c' * 32
    nested_schema = dict(database_id=nested_id, name='Contenido', columns=[dict(id='n',name='Número',type='number')], views=[dict(id='default',name='Primera',type='table',sorts=[dict(colId='n',dir='asc')]),dict(id='current',name='Activa',type='board',hidden=[],filters=[dict(colId='n',op='gt',value=1)],sorts=[dict(colId='n',dir='desc')])],activeView='current')
    write_body(client, root, 'Párrafo conservado\n\n:::database\n' + json.dumps(nested_schema) + '\n:::')
    nested_base = f'/api/databases/{root["id"]}/{nested_id}'
    rows = [titled(client, nested_base, 'Same/name', values={'n':n}) for n in (1,3,2)]
    for r in rows: write_body(client,r,'Cuerpo hijo ' + r['id'])
    return client, base, parent, root, nested_base, rows, sibling


def test_record_scope_does_not_export_siblings_or_parent_database(workspace):
    client,base,parent,root,nested,rows,sibling=nested_fixture(workspace)
    archive, manifest = exported(client,base,root)
    assert [p['id'] for p in manifest['pages']] == [root['id']]
    assert manifest['databases'][0]['row_ids'] == [rows[1]['id'],rows[2]['id']]
    body = archive.read(manifest['entrypoint']).decode()
    assert 'Párrafo conservado' in body and '| Número | 0 |' in body
    assert 'SECRET PARENT SIBLING' not in '\n'.join(v.decode(errors='ignore') for v in [archive.read(n) for n in archive.namelist()])
    assert 'Cuerpo hijo' not in body
    assert manifest['databases'][0]['parent_id'] == root['id'] and parent not in [p['id'] for p in manifest['pages']]
    csv_name=next(n for n in archive.namelist() if n.endswith('.csv'))
    values=list(csv.reader(io.StringIO(archive.read(csv_name).decode())))
    assert [r[-1] for r in values[1:]] == ['3','2'] and all(r[1] == '' for r in values[1:])


def test_views_subpages_folders_unique_names_and_consistent_links(workspace):
    client,base,parent,root,nested,rows,sibling=nested_fixture(workspace)
    child_response=client.post('/api/entry',json=dict(title='Same/name',entry_type='page',parent_id=root['id'],raw_text='Ordinary child',already_markdown=True))
    assert child_response.status_code==200
    child=child_response.json['id']
    archive,manifest=exported(client,base,root,database_view='default',include_subpages=True,folders=True)
    ids=[p['id'] for p in manifest['pages']]
    assert set(ids)=={root['id'],child,*[r['id'] for r in rows]}
    assert len(archive.namelist())==len(set(archive.namelist()))
    root_name=manifest['entrypoint'];root_base=root_name[:-3]
    assert all(p['path'].startswith(root_base + '/') for p in manifest['pages'] if p['id']!=root['id'])
    assert manifest['databases'][0]['row_ids']==[rows[0]['id'],rows[2]['id'],rows[1]['id']]
    assert manifest['warnings']
    csv_name=next(n for n in archive.namelist() if n.endswith('.csv'))
    import posixpath
    for r in list(csv.reader(io.StringIO(archive.read(csv_name).decode())))[1:]:
        assert posixpath.normpath(posixpath.join(posixpath.dirname(csv_name),r[1])) in archive.namelist()
    flat, flat_manifest=exported(client,base,root,include_subpages=True,folders=False)
    assert all('/' not in p['path'] for p in flat_manifest['pages'])


def test_files_are_byte_exact_rewritten_or_excluded_and_private_remote_blocked(workspace):
    client,base,_=workspace;root=create(client,base)
    result=client.post('/api/databases/files',data={'file':(io.BytesIO(b'bytes\x00\xffEXACT'),'a strange file.txt')},content_type='multipart/form-data')
    uploaded=result.json
    schema_change(client,base,operation='add',column=dict(name='Adjuntos',type='files'))
    col=client.get(base).json['schema']['columns'][-1]['id']
    assert client.patch(base+'/rows/'+root['id'],json={'values':{col:[uploaded]}}).status_code==200
    write_body(client,root,'![Local]('+uploaded['url']+')\n\n[Archivo]('+uploaded['url']+')\n\n![Remota](http://127.0.0.1:9/secret.png)')
    archive,manifest=exported(client,base,root)
    assert len(manifest['assets'])==1
    assert archive.read(manifest['assets'][0])==b'bytes\x00\xffEXACT'
    assert any(o['reason']=='remote_port_blocked' for o in manifest['omitted'])
    body=archive.read(manifest['entrypoint']).decode()
    assert '/api/databases/files/' not in body and 'http://127.0.0.1:9' not in body
    excluded,omitted=exported(client,base,root,include_content='no_files')
    assert omitted['assets']==[] and not any(n.startswith('assets/') for n in excluded.namelist())
    text=excluded.read(omitted['entrypoint']).decode()
    assert '![' not in text and '/api/databases/files/' not in text
    obj,objmanifest=exported(client,base,root,format='json',include_content='no_files')
    record=json.loads(obj.read(objmanifest['entrypoint']))
    assert next(p['value'] for p in record['row']['properties'] if p['id']==col)==[]
    # Exporting never edits source metadata/body or uploaded bytes.
    assert client.get('/api/entry/'+root['id']).json['markdown'].endswith('secret.png)')
    assert client.get(uploaded['url']).data==b'bytes\x00\xffEXACT'


def test_html_and_pdf_contain_rendered_body_and_properties(workspace):
    client,base,_=workspace;root=create(client,base,values={'n':8.5,'text':'Conservar'})
    write_body(client,root,'## Encabezado real\n\n**Contenido visible**')
    archive,manifest=exported(client,base,root,format='html')
    html=archive.read(manifest['entrypoint']).decode()
    assert '<h2' in html and 'Encabezado real' in html and '<strong>Contenido visible</strong>' in html
    assert '<table' in html and '8.5' in html and 'Conservar' in html
    pytest.importorskip('weasyprint')
    archive,manifest=exported(client,base,root,format='pdf')
    pdf=archive.read(manifest['entrypoint'])
    assert pdf.startswith(b'%PDF-') and pdf.endswith(b'%%EOF\n') and len(pdf)>2000
    fitz=pytest.importorskip('fitz')
    document=fitz.open(stream=pdf,filetype='pdf')
    text=''.join(p.get_text() for p in document)
    assert len(document)>=1 and 'Encabezado real' in text and 'Contenido visible' in text and '8.5' in text


def test_options_ownership_bounds_and_raw_code_database_are_safe(workspace):
    client,base,parent=workspace;root=create(client,base)
    route=base+'/rows/'+root['id']+'/export'
    for bad in [None,[],{'format':'fake'},{'include_subpages':'yes'},{'folders':True},{'unknown':True}]:
        assert client.post(route,json=bad).status_code==400
    assert client.post(f'/api/databases/{parent}/{B}/rows/{root["id"]}/export',json={}).status_code==404
    write_body(client,root,'```\n:::database\n{"database_id":"not-real"}\n:::\n```')
    archive,manifest=exported(client,base,root)
    assert manifest['databases']==[] and 'not-real' in archive.read(manifest['entrypoint']).decode()
    client.delete(base+'/rows/'+root['id'])
    assert client.post(route,json={}).status_code==404


def test_local_images_are_embedded_in_real_pdf_and_removed_when_excluded(workspace):
    import base64
    pytest.importorskip('weasyprint'); fitz=pytest.importorskip('fitz')
    client,base,_=workspace;root=create(client,base)
    image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6t0QAAAAASUVORK5CYII=')
    uploaded=client.post('/api/databases/files',data={'file':(io.BytesIO(image),'pixel.png')},content_type='multipart/form-data').json
    write_body(client,root,'Before\n\n![Pixel]('+uploaded['url']+')\n\nAfter')
    archive,manifest=exported(client,base,root,format='pdf')
    pdf=fitz.open(stream=archive.read(manifest['entrypoint']),filetype='pdf')
    assert sum(len(p.get_images()) for p in pdf)>0
    archive,manifest=exported(client,base,root,format='pdf',include_content='no_files')
    pdf=fitz.open(stream=archive.read(manifest['entrypoint']),filetype='pdf')
    assert sum(len(p.get_images()) for p in pdf)==0 and manifest['assets']==[]


def test_persistent_cover_url_is_bundled_and_exclusion_keeps_original(workspace):
    import base64
    client,base,_=workspace;row=create(client,base)
    image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6t0QAAAAASUVORK5CYII=')
    response=client.post('/api/upload/cover',json={'dataUrl':'data:image/png;base64,'+base64.b64encode(image).decode()})
    assert response.status_code==200
    url=response.json['url'];write_body(client,row,'![Portada]('+url+')')
    archive,manifest=exported(client,base,row)
    assert len(manifest['assets'])==1 and archive.read(manifest['assets'][0])==image
    archive,manifest=exported(client,base,row,include_content='no_files')
    assert not manifest['assets'] and client.get(url).data==image


def test_raw_html_media_and_file_links_follow_exclusion_policy(workspace):
    client,base,_=workspace;root=create(client,base,values={'text':'![Plain property](https://example.com/pixel.png) <img src="https://example.com/plain.png">'})
    uploaded=client.post('/api/databases/files',data={'file':(io.BytesIO(b'abc'),'file.txt')},content_type='multipart/form-data').json
    write_body(client,root,'<img src="'+uploaded['url']+'">\n\n<a href="'+uploaded['url']+'">Download</a>\n\n[Remote file](https://example.com/archive.zip)')
    archive,manifest=exported(client,base,root,format='html',include_content='no_files')
    html=archive.read(manifest['entrypoint']).decode()
    assert '<img' not in html and uploaded['url'] not in html and 'href="https://example.com/archive.zip' not in html
    assert not manifest['assets']


def test_boundaries_and_missing_assets_are_explicit(workspace, monkeypatch):
    import database_export
    client,base,_=workspace;root=create(client,base)
    write_body(client,root,'![Missing](/api/databases/files/'+'f'*32+')')
    archive,manifest=exported(client,base,root)
    assert manifest['omitted']==[dict(url='/api/databases/files/'+'f'*32,reason='local_asset_missing')]
    monkeypatch.setattr(database_export,'MAX_BYTES',50)
    result=client.post(base+'/rows/'+root['id']+'/export',json={})
    assert result.status_code==400 and '50 MB' in result.json['error']


def test_literal_code_examples_are_preserved_and_do_not_expand_export_scope(workspace):
    client,base,_=workspace;root=create(client,base)
    fake_schema=json.dumps(dict(database_id='db_'+'f'*32,columns=[],views=[dict(id='v',type='table')]))
    literal=('```markdown\n![Fenced](https://example.com/code.png)\n'
             '<img src="https://example.com/html.png">\n'
             ':::database\n'+fake_schema+'\n:::\n```\n\n'
             '~~~markdown\n[File](https://example.com/code.zip)\n~~~\n\n'
             '    ![Indented](https://example.com/indent.png)\n'
             '    :::database\n    '+fake_schema+'\n    :::\n\n'
             '`![Inline](https://example.com/inline.png)` and '
             '``<img src="https://example.com/inline-html.png">``\n'
             '\\\\`![Even escapes](https://example.com/even.png)`\n')
    write_body(client,root,literal)
    for content in ('all','no_files'):
        archive,manifest=exported(client,base,root,include_content=content,include_subpages=True)
        output=archive.read(manifest['entrypoint']).decode()
        assert literal in output
        assert manifest['assets']==[] and manifest['databases']==[] and manifest['omitted']==[]
        assert [p['id'] for p in manifest['pages']]==[root['id']]


def test_export_omissions_are_unique_by_resource_and_reason(workspace):
    client,base,_=workspace;root=create(client,base)
    missing='/api/databases/files/'+'f'*32
    remote='https://example.com/unavailable.png'
    write_body(client,root,'![One]('+missing+')\n\n[Two]('+missing+')\n\n![Remote]('+remote+')\n\n<img src="'+remote+'">')
    archive,manifest=exported(client,base,root)
    assert manifest['omitted']==[dict(url=missing,reason='local_asset_missing'),dict(url=remote,reason='remote_fetch_failed')]


def test_blocknote_media_metadata_keeps_rewritable_urls_and_exclusion_policy(workspace):
    from urllib.parse import quote
    client,base,_=workspace;root=create(client,base)
    raw=b'bytes from blocknote media\x00\xff'
    uploaded=client.post('/api/databases/files',data={'file':(io.BytesIO(raw),'nombre (1) "cita".txt')},content_type='multipart/form-data').json
    fragments=[]
    for kind in ('image','audio','video','file'):
        metadata=quote(json.dumps(dict(type=kind,name='Nombre ]( "cita" (1)',caption='Pie conservado',showPreview=False)),safe='')
        fragments.append(('!' if kind=='image' else '')+'[Nombre &#93;( "cita" (1)](<'+uploaded['url']+'>) <!-- atlas-media:'+metadata+' -->')
    body='\n\n'.join(fragments)
    write_body(client,root,body)
    included,manifest=exported(client,base,root)
    assert len(manifest['assets'])==1 and included.read(manifest['assets'][0])==raw
    included_text=included.read(manifest['entrypoint']).decode()
    assert uploaded['url'] not in included_text
    assert included_text.count('assets/')==4
    excluded,manifest=exported(client,base,root,include_content='no_files')
    output=excluded.read(manifest['entrypoint']).decode()
    assert not manifest['assets'] and '![' not in output and uploaded['url'] not in output
    assert 'assets/' not in output and '<img' not in output
    assert client.get('/api/entry/'+root['id']).json['markdown']==body


def test_public_remote_assets_are_included_exactly_once_and_exclusion_does_not_fetch(workspace,monkeypatch):
    import database_export
    client,base,_=workspace;root=create(client,base);calls=[]
    payload=b'\x89PNG\r\nfixture bytes';url='https://public.invalid/media'
    def fetch(address,limit,timeout):calls.append(address);assert limit<=20*1024*1024;return payload,'image/png',address
    monkeypatch.setattr(database_export,'fetch_remote_asset',fetch)
    write_body(client,root,'![Uno]('+url+')\n\n<img src="'+url+'">')
    archive,manifest=exported(client,base,root)
    assert calls==[url] and len(manifest['assets'])==1 and manifest['omitted']==[]
    name=manifest['assets'][0];assert name.endswith('.png') and archive.read(name)==payload
    assert url not in archive.read(manifest['entrypoint']).decode()
    calls.clear();excluded,manifest=exported(client,base,root,include_content='no_files')
    assert calls==[] and manifest['assets']==[]


def test_network_export_does_not_hold_database_writer_lock(workspace,monkeypatch):
    import database_export
    import threading
    client,base,_=workspace;root=create(client,base,values={'n':0});finished=threading.Event();threads=[];results=[]
    write_body(client,root,'![Remote](https://public.invalid/a.png)')
    def fetch(*args,**kwargs):
        def write():
            with application.app.test_client() as local:
                local.post('/login',data={'password':'test-password'})
                results.append(local.patch(base+'/rows/'+root['id'],json={'values':{'n':9}}).status_code)
            finished.set()
        thread=threading.Thread(target=write,daemon=True);threads.append(thread);thread.start()
        assert finished.wait(2),'Export network work blocked a cell save'
        return b'bytes','image/png','https://public.invalid/a.png'
    monkeypatch.setattr(database_export,'fetch_remote_asset',fetch)
    try:
        archive,manifest=exported(client,base,root)
        assert results==[200]
        # The archive is the consistent earlier snapshot; the live row has9.
        assert '| Número | 0 |' in archive.read(manifest['entrypoint']).decode()
        assert next(p['value'] for p in client.get(base).json['rows'][0]['properties'] if p['id']=='n')==9
    finally:
        for thread in threads:thread.join(3)


def test_export_columns_follow_view_order_and_not_shared_schema(workspace):
    client,base,parent,root,nested,rows,sibling=nested_fixture(workspace)
    assert schema_change(client,nested,operation='add',column={'name':'Texto extra','type':'text'}).status_code==200
    schema=client.get(nested).json['schema'];extra=schema['columns'][-1]['id'];schema['views'][1]['columnOrder']=[extra,'n']
    assert schema_change(client,nested,operation='schema',schema=schema).status_code==200
    archive,manifest=exported(client,base,root)
    headers=next(archive.read(name).decode().splitlines()[0] for name in archive.namelist() if name.endswith('.csv'))
    assert headers.index('Texto extra')<headers.index('Número')
    assert client.get(nested).json['schema']['columns'][0]['id']=='n'


def test_export_nested_filter_scope_matches_rows_in_artifact(workspace):
    client,base,parent,root,nested,rows,sibling=nested_fixture(workspace)
    schema=client.get(nested).json['schema']
    current=schema['views'][1]
    current.update(filters=[{'mode':'or','rules':[{'colId':'n','op':'is','value':1},{'mode':'and','rules':[{'colId':'n','op':'gt','value':1},{'colId':'n','op':'lt','value':3}]}]}],filterTimeZone='America/Tegucigalpa')
    assert schema_change(client,nested,operation='schema',schema=schema).status_code==200
    before=client.get(nested).json['rows']
    archive,manifest=exported(client,base,root)
    assert manifest['databases'][0]['row_ids']==[rows[2]['id'],rows[0]['id']]
    csv_name=next(n for n in archive.namelist() if n.endswith('.csv'))
    assert [r[-1] for r in list(csv.reader(io.StringIO(archive.read(csv_name).decode())))[1:]]==['2','1']
    assert manifest['filter_evaluated_at'].endswith('+00:00')
    assert client.get(nested).json['rows']==before


@pytest.mark.parametrize('fmt',['markdown_csv','html','pdf','json'])
def test_export_date_range_preserves_both_endpoints(workspace,fmt):
    client,base,parent=workspace
    col=schema_change(client,base,operation='add',column={'name':'Intervalo','type':'date'}).json['schema']['columns'][-1]['id']
    value={'start':'2026-10-18T01:10:05+03:00','end':'2026-10-21T02:11:06+03:00'}
    row=create(client,base,values={col:value,'n':0});write_body(client,row,'Cuerpo intacto del rango')
    before=client.get('/api/entry/'+row['id']).json
    before_meta=application.load_index()[row['id']]
    archive,manifest=exported(client,base,row,format=fmt)
    payload=archive.read(manifest['entrypoint'])
    if fmt=='pdf':
        import fitz
        text='\n'.join(p.get_text() for p in fitz.open(stream=payload,filetype='pdf'))
    else:text=payload.decode()
    assert '2026-10-18T01:10:05+03:00' in text and '2026-10-21T02:11:06+03:00' in text
    assert 'Cuerpo intacto del rango' in text
    if fmt=='json':assert next(p['value'] for p in json.loads(payload)['row']['properties'] if p['id']==col)==value
    assert application.load_index()[row['id']]==before_meta
    after=client.get('/api/entry/'+row['id']).json
    # Opening a page updates last_viewed_at, independently of read-only export.
    before['meta'].pop('last_viewed_at',None);after['meta'].pop('last_viewed_at',None)
    assert after==before
