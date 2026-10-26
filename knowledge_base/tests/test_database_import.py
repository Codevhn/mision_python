"""Synthetic import contracts: never use the private books inventory."""
import io
import json
from pathlib import Path
import pytest
import app as application
from database_import import parse_file, drive_id

ID = 'synthetic_Drive_file_001'
ID2 = 'synthetic_Drive_file_002'


def upload(client, data, name='synthetic.json'):
    content = data.encode() if isinstance(data, str) else json.dumps(data, ensure_ascii=False).encode()
    return client.post('/api/databases/import/preview', data={'file': (io.BytesIO(content), name)}, content_type='multipart/form-data')


def config(token, **extra):
    return dict(token=token, collection='/catalog/items', title_field='/title', identity_field='/drive/id', name='Synthetic library',
                columns=[dict(field='/drive/id', name='Drive ID', type='text'), dict(field='/drive/link', name='Drive link', type='url'),
                         dict(field='/author_candidates', name='Autores provisionales', type='text'), dict(field='/pages', name='Páginas', type='number')], **extra)


def inventory():
    return dict(version=1, catalog=dict(items=[dict(title='Synthetic book', drive=dict(id=ID, link=f'https://drive.google.com/file/d/{ID}/view'),
                                                 author_candidates=[dict(name='Provisional', confirmed=False)], pages=0)]),
                candidate_groups=[dict(id='separate', candidates=[ID, ID2])])


def validate(client, cfg):
    result = client.post('/api/databases/import/validate', json=cfg)
    assert result.status_code == 200, result.json
    return {**cfg, 'confirmation': result.json['fingerprint']}, result.json


def apply(client, cfg):
    checked, report = validate(client, cfg)
    response = client.post('/api/databases/import/apply', json=checked)
    assert response.status_code in (200, 201), response.json
    return response.json


def test_nested_selection_preview_does_not_create_entries(auth_client):
    before = application.load_index()
    response = upload(auth_client, inventory()); assert response.status_code == 200
    assert {x['path'] for x in response.json['collections']} == {'/catalog/items', '/candidate_groups'}
    token = response.json['token']
    assert auth_client.post('/api/databases/import/inspect', json=dict(token=token, collection='')).status_code == 400
    inspect = auth_client.post('/api/databases/import/inspect', json=dict(token=token, collection='/catalog/items'))
    assert inspect.json['count'] == 1
    assert '/drive/id' in [f['path'] for f in inspect.json['fields']]
    assert inspect.json['sample'][0]['author_candidates'][0]['confirmed'] is False
    assert application.load_index() == before


def test_native_import_persistence_ids_links_and_private_source(auth_client):
    token = upload(auth_client, inventory()).json['token']; report = apply(auth_client, config(token))
    assert report['counts']['created'] == 1
    base = f"/api/databases/{report['parent_id']}/{report['database_id']}"
    result = auth_client.get(base).json; assert len(result['rows']) == 1
    row = result['rows'][0]
    assert row['database_id'] == report['database_id'] and row['db_row'] is True
    props = {p['name']: p['value'] for p in row['properties']}
    assert props['Drive ID'] == ID and props['Drive link'] == inventory()['catalog']['items'][0]['drive']['link']
    assert json.loads(props['Autores provisionales'])[0]['confirmed'] is False and props['Páginas'] == 0
    assert row['import_original'] == inventory()['catalog']['items'][0]
    assert row['import_identity']['drive_id'] == ID
    assert len(application.load_index()) == 2  # candidate_groups are not imported or merged
    archive = next((application.DATA_DIR/'database_imports').glob('source-*.json'))
    assert json.loads(archive.read_text()) == inventory()
    assert archive.stat().st_mode & 0o777 == 0o600
    assert auth_client.get(base).json['rows'][0]['id'] == row['id']


def test_repeated_file_and_append_never_overwrite_existing(auth_client):
    data = inventory();token = upload(auth_client, data).json['token']; cfg = config(token)
    result = apply(auth_client, cfg); base = f"/api/databases/{result['parent_id']}/{result['database_id']}"
    row = auth_client.get(base).json['rows'][0]
    auth_client.patch('/api/entry/'+row['id']+'/content', json=dict(raw_text='Private reading notes', already_markdown=True))
    cols = auth_client.get(base).json['schema']['columns'];ncol = next(c for c in cols if c['name']=='Páginas')
    auth_client.patch(base+'/rows/'+row['id'], json=dict(values={ncol['id']:73}))
    # New upload of identical file, same explicit mapping: same receipt, no second DB.
    cfg['token'] = upload(auth_client, data).json['token']; repeated = apply(auth_client, cfg)
    assert repeated['replay'] and repeated['parent_id'] == result['parent_id']
    data['catalog']['items'][0]['pages'] = 999
    data['catalog']['items'].append({**data['catalog']['items'][0], 'drive':dict(id=ID2,link=f'https://drive.google.com/file/d/{ID2}/view')})
    cfg = config(upload(auth_client, data).json['token'], target=dict(parent=result['parent_id'], database_id=result['database_id']))
    for m in cfg['columns']:m['target_column'] = next(c['id'] for c in cols if c['name']==m['name'])
    before_existing = application.load_index()[row['id']]
    imported = apply(auth_client, cfg)
    assert application.load_index()[row['id']] == before_existing
    assert imported['counts']['duplicate_existing'] == 1 and imported['counts']['created'] == 1
    fresh = auth_client.get('/api/entry/'+row['id']).json
    assert fresh['markdown'] == 'Private reading notes'
    assert next(p['value'] for p in fresh['meta']['properties'] if p['id']==ncol['id']) == 73


def test_invalid_batch_is_atomic_and_can_be_corrected(auth_client):
    data = inventory(); data['catalog']['items'] += [{**data['catalog']['items'][0], 'drive':dict(id=ID2,link='https://example.com'), 'pages':'NaN'}]
    cfg = config(upload(auth_client, data).json['token']); checked, preview = validate(auth_client,cfg)
    assert preview['counts']['invalid'] == 1
    response = auth_client.post('/api/databases/import/apply', json=checked)
    assert response.status_code == 422 and application.load_index() == {}
    assert not list(application.KNOWLEDGE_DIR.rglob('*.md'))


def test_duplicates_in_file_are_reported_without_merging(auth_client):
    data=inventory();data['catalog']['items'].append({**data['catalog']['items'][0], 'title':'Another candidate title'})
    report=apply(auth_client, config(upload(auth_client,data).json['token']))
    assert report['counts']['created']==1 and report['counts']['duplicate_in_file']==1
    assert report['rows'][1]['first_row']==1


def test_csv_bom_quotes_newlines_zeroes_and_boolean(auth_client):
    text=f'\ufeffTitle;Drive;Note;Pages;Read\r\n"Book; A";{ID};"line one\nline two";0;false\r\n'
    token=upload(auth_client,text,'synthetic.csv').json['token']
    cfg=dict(token=token,collection='',title_field='/Title',identity_field='/Drive',name='CSV',columns=[dict(field='/Drive',name='ID',type='text'),dict(field='/Note',name='Nota',type='text'),dict(field='/Pages',name='Páginas',type='number'),dict(field='/Read',name='Leído',type='checkbox')])
    result=apply(auth_client,cfg);row=auth_client.get(f"/api/databases/{result['parent_id']}/{result['database_id']}").json['rows'][0]
    assert row['title']=='Book; A'
    props={p['name']:p['value'] for p in row['properties']}
    assert props['Nota']=='line one\nline two' and props['Páginas']==0 and props['Leído'] is False


@pytest.mark.parametrize('content,name', [('a,a\n1,2','bad.csv'),('a,b\n1,2,3','bad.csv'),('{"a":[],"a":[]}', 'bad.json'),('{"a":NaN}','bad.json'),('[]','bad.json')])
def test_invalid_input_rejected(auth_client,content,name):
    assert upload(auth_client,content,name).status_code == 400


def test_confirmation_invalidated_by_mapping_change(auth_client):
    cfg=config(upload(auth_client,inventory()).json['token']);checked,_=validate(auth_client,cfg)
    checked['columns'][0]['name']='Changed'
    assert auth_client.post('/api/databases/import/apply',json=checked).status_code==400
    assert application.load_index()=={}


def test_upload_auth_and_preview_token_traversal(client,auth_client):
    # auth_client and client share the test client; clear its session explicitly.
    auth_client.get('/logout')
    assert upload(client,inventory()).status_code==401
    client.post('/login',data={'password':'test-password'})
    assert client.post('/api/databases/import/inspect',json=dict(token='../../secret',collection='')).status_code==400


def test_disk_failure_rolls_back_files_and_entries(auth_client,monkeypatch):
    cfg=config(upload(auth_client,inventory()).json['token']);checked,_=validate(auth_client,cfg)
    original=Path.open
    def fail(path,*args,**kwargs):
        if path.name.startswith('record-') and 'x' in str(args):raise OSError('synthetic disk failure')
        return original(path,*args,**kwargs)
    monkeypatch.setattr(Path,'open',fail)
    assert auth_client.post('/api/databases/import/apply',json=checked).status_code==507
    assert application.load_index()=={} and not list(application.KNOWLEDGE_DIR.rglob('*.md'))
    monkeypatch.setattr(Path,'open',original)
    assert auth_client.post('/api/databases/import/apply',json=checked).status_code==201


def test_drive_url_canonicalization_and_numeric_id_rejection():
    assert drive_id(f'https://drive.google.com/open?id={ID}')==ID
    assert drive_id(f'https://drive.google.com/file/d/{ID}/view')==ID
    with pytest.raises(ValueError):drive_id(12345678901)
    with pytest.raises(ValueError):drive_id('https://attacker.example/open?id='+ID)

def test_persisted_report_and_trash_duplicate_stay_recoverable(auth_client):
    cfg=config(upload(auth_client,inventory()).json['token']);first=apply(auth_client,cfg)
    base=f"/api/databases/{first['parent_id']}/{first['database_id']}"
    row=auth_client.get(base).json['rows'][0]
    assert auth_client.delete(base+'/rows/'+row['id']).status_code==200
    cfg=config(upload(auth_client,inventory()).json['token'],target=dict(parent=first['parent_id'],database_id=first['database_id']))
    cols=auth_client.get(base).json['schema']['columns']
    for m in cfg['columns']:m['target_column']=next(c['id'] for c in cols if c['name']==m['name'])
    result=apply(auth_client,cfg)
    assert result['counts']['duplicate_in_trash']==1 and result['counts']['created']==0
    assert auth_client.get(base).json['rows']==[]
    report=auth_client.get('/api/databases/import/reports/'+result['id'])
    assert report.status_code==200 and report.json['counts']==result['counts']
    assert 'attachment' in report.headers['Content-Disposition']
    assert auth_client.post(base+'/deleted/'+row['id']).status_code==200
    assert len(auth_client.get(base).json['rows'])==1


def test_existing_records_without_import_metadata_are_matched_by_drive_column(auth_client):
    first=apply(auth_client,config(upload(auth_client,inventory()).json['token']))
    base=f"/api/databases/{first['parent_id']}/{first['database_id']}"; row=auth_client.get(base).json['rows'][0]
    index=application.load_index();index[row['id']].pop('import_identity');application.save_index(index)
    cols=auth_client.get(base).json['schema']['columns'];cfg=config(upload(auth_client,inventory()).json['token'],target=dict(parent=first['parent_id'],database_id=first['database_id']))
    for m in cfg['columns']:m['target_column']=next(c['id'] for c in cols if c['name']==m['name'])
    result=apply(auth_client,cfg)
    assert result['counts']['duplicate_existing']==1 and result['counts']['created']==0


def test_identity_column_cannot_be_removed_or_converted_to_number(auth_client):
    cfg=config(upload(auth_client,inventory()).json['token']);cfg['columns']=cfg['columns'][1:]
    assert auth_client.post('/api/databases/import/validate',json=cfg).status_code==400
    cfg=config(upload(auth_client,inventory()).json['token']);cfg['columns'][0]['type']='number'
    assert auth_client.post('/api/databases/import/validate',json=cfg).status_code==400


def test_bad_config_and_wrong_target_dont_write(auth_client):
    cfg=config(upload(auth_client,inventory()).json['token']);cfg['columns']=['not a mapping']
    assert auth_client.post('/api/databases/import/validate',json=cfg).status_code==400
    assert auth_client.post('/api/databases/import/validate',json=['bad config']).status_code==400
    cfg=config(upload(auth_client,inventory()).json['token'],target=dict(parent='missing',database_id='db_'+'a'*32))
    assert auth_client.post('/api/databases/import/validate',json=cfg).status_code==400
    assert application.load_index()=={}


def test_crash_journal_only_cleans_exact_uncommitted_files(auth_client):
    import hashlib
    folder=application.DATA_DIR/'database_imports';folder.mkdir()
    pages=application.KNOWLEDGE_DIR/'pages';pages.mkdir()
    orphan=pages/'record-orphan.md';orphan.write_text('original orphan bytes')
    journal=dict(status='prepared',fingerprint='not committed',files=[dict(id='record-orphan',meta=dict(type='page'),sha256=hashlib.sha256(orphan.read_bytes()).hexdigest())])
    (folder/'run-interrupted.json').write_text(json.dumps(journal))
    apply(auth_client,config(upload(auth_client,inventory()).json['token']))
    assert not orphan.exists()
    assert json.loads((folder/'run-interrupted.json').read_text())['status']=='rolled_back'
    orphan.write_text('changed independently')
    journal['status']='prepared';(folder/'run-interrupted.json').write_text(json.dumps(journal))
    cfg=config(upload(auth_client,inventory()).json['token']);cfg['name']='Another import'
    checked,_=validate(auth_client,cfg)
    before=application.load_index()
    assert auth_client.post('/api/databases/import/apply',json=checked).status_code==400
    assert orphan.read_text()=='changed independently' and application.load_index()==before

@pytest.mark.parametrize('kind,value,expected', [
    ('date','2026-10-20','2026-10-20'),
    ('number','12.50',12.5),
    ('multi_select','["Uno","Dos"]',['Uno','Dos']),
    ('select','Provisional','Provisional'),
    ('status','Pendiente','Pendiente'),
    ('checkbox','sí',True),
    ('email','synthetic@example.test','synthetic@example.test'),
    ('phone','+000 123','+000 123'),
])
def test_import_mapping_uses_native_property_types(auth_client,kind,value,expected):
    data={'rows':[{'title':'Synthetic mapping','drive_id':ID,'value':value}]}
    token=upload(auth_client,data).json['token']
    cfg=dict(token=token,collection='/rows',name='Mapping',title_field='/title',identity_field='/drive_id',columns=[dict(field='/drive_id',name='Drive ID',type='text'),dict(field='/value',name='Valor',type=kind)])
    result=apply(auth_client,cfg)
    payload=auth_client.get(f"/api/databases/{result['parent_id']}/{result['database_id']}").json
    prop=next(p for p in payload['rows'][0]['properties'] if p['name']=='Valor')
    assert prop['type']==kind and prop['value']==expected
    assert result['configuration']['columns'][1]['type']==kind
    if kind in ('status','select','multi_select'):
        assert payload['schema']['columns'][1]['options']


def book_inventory_fixture():
    """Only structural names match the real format; every value is synthetic."""
    from database_import_profiles import BOOK_COLUMNS
    row={key:None for key,_,_ in BOOK_COLUMNS}
    row.update(drive_id=ID,titulo_desde_nombre='Synthetic provisional title',autoria_desde_nombre='Synthetic provisional author',
               autores_verificados=[],nombre_original='synthetic.epub',formato='epub',mime_type='application/epub+zip',
               tamano_bytes=123,enlace_drive=f'https://drive.google.com/file/d/{ID}/view',carpeta='Synthetic folder',
               fecha_creacion_drive='2026-01-01T10:00:00Z',fecha_modificacion_drive='2026-01-02T10:00:00Z',
               grupo_candidato='synthetic-group',fuente_metadatos='Synthetic filename; content not reviewed',verificacion='Pendiente',
               tematicas=[],etiquetas=[])
    return dict(version='1.0',archivos=[row],grupos_candidatos=[dict(clave='synthetic-group',archivos=[ID],confirmado=False)],
                metadatos_drive_originales=[dict(id=ID,title='synthetic.epub')])


def test_books_profile_locks_books_collection_and_preserves_provisional_data(auth_client):
    data=book_inventory_fixture(); preview=upload(auth_client,data).json
    assert preview['collections']==[dict(path='/archivos',count=1)]
    assert preview['profile']['context_counts']==dict(candidate_groups=1,original_drive_metadata=1)
    assert auth_client.post('/api/databases/import/inspect',json=dict(token=preview['token'],collection='/grupos_candidatos')).status_code==400
    assert auth_client.post('/api/databases/import/inspect',json=dict(token=preview['token'],collection='/metadatos_drive_originales')).status_code==400
    p=preview['profile'];cfg=dict(token=preview['token'],collection=p['collection'],title_field=p['title_field'],identity_field=p['identity_field'],name=p['name'],columns=p['columns'])
    result=apply(auth_client,cfg);base=f"/api/databases/{result['parent_id']}/{result['database_id']}";payload=auth_client.get(base).json
    assert len(payload['rows'])==1 and len(application.load_index())==2
    row=payload['rows'][0];props={p['name']:p['value'] for p in row['properties']}
    assert props['Autoría provisional · nombre de archivo']=='Synthetic provisional author'
    assert props['Autores verificados']==[]
    assert props['PDF escaneado · sin confirmar']=='' and props['OCR disponible · sin confirmar']==''
    assert row['import_original']['pdf_escaneado'] is None
    assert result['profile']=='books-drive-inventory-v1' and result['context_counts']==p['context_counts']
    assert 'provisional' in payload['schema']['titleName']
    assert json.loads(next((application.DATA_DIR/'database_imports').glob('source-*.json')).read_text())==data


def test_books_profile_does_not_guess_unknown_versions_or_id_fields(auth_client):
    data=book_inventory_fixture();data['version']='2.0'
    assert upload(auth_client,data).status_code==400
    data['version']='1.0';preview=upload(auth_client,data).json;p=preview['profile']
    cfg=dict(token=preview['token'],collection='/archivos',title_field='/nombre_original',identity_field='/drive_id',name=p['name'],columns=p['columns'])
    assert auth_client.post('/api/databases/import/validate',json=cfg).status_code==400
    assert application.load_index()=={}
