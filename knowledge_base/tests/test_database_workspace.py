"""Workspace contracts use temporary stores, never the user's records."""
import io
import json
import pytest
import app as application
from database_api import formula, validate

A, B = 'db_'+'a'*32, 'db_'+'b'*32

@pytest.fixture
def workspace(auth_client):
    columns=[dict(id='text',name='Nota',type='text'),dict(id='n',name='Número',type='number'),
             dict(id='s',name='Estado',type='status',options=[dict(label='Pendiente',color='#888888'),dict(label='Hecho',color='#238364')])]
    schema=dict(database_id=A,columns=columns,views=[dict(id='t',name='Tabla',type='table'),dict(id='b',name='Board',type='board',groupBy='s')],activeView='t')
    other=dict(database_id=B,columns=[],views=[dict(id='v',name='Tabla',type='table')])
    response=auth_client.post('/api/entry',json=dict(title='Workspace',entry_type='page',raw_text=':::database\n'+json.dumps(schema)+'\n:::\n\n:::database\n'+json.dumps(other)+'\n:::',already_markdown=True))
    parent=response.json['id'];base=f'/api/databases/{parent}/{A}'
    return auth_client,base,parent

def schema_change(client,base,**data):
    return client.patch(base,json=dict(revision=client.get(base).json['revision'],**data))

def create(client,base,**data):
    response=client.post(base+'/rows',json={'title':'Ejemplo',**data});assert response.status_code==201,response.json
    return response.json['row']

def test_group_moves_use_latest_tags_and_protect_other_memberships(workspace):
    client,base,parent=workspace
    response=schema_change(client,base,operation='add',column={'name':'Etiquetas','type':'multi_select','options':[{'label':x} for x in ['A','B','C','D']]})
    col=response.json['schema']['columns'][-1]['id']
    row=create(client,base,values={col:['A','B']},title='Conservado')
    client.patch('/api/entry/'+row['id']+'/content',json={'raw_text':'Cuerpo conservado','already_markdown':True})
    # A different cell edit added D after the Board's drag snapshot was taken.
    assert client.patch(base+'/rows/'+row['id'],json={'values':{col:['A','B','D']}}).status_code==200
    move=lambda origin,target:client.patch(base+'/rows/'+row['id'],json={'group_move':{'column_id':col,'from':origin,'to':target}})
    result=move('A','C');assert result.status_code==200
    assert next(p['value'] for p in result.json['row']['properties'] if p['id']==col)==['B','D','C']
    assert move('A','B').status_code==409
    assert move('C',None).status_code==409  # no silent removal of B/D
    assert move('C','not-defined').status_code==400
    other=base.rsplit('/',1)[0]+'/'+B
    assert client.patch(other+'/rows/'+row['id'],json={'group_move':{'column_id':col,'from':'C','to':'A'}}).status_code==404
    fresh=client.get('/api/entry/'+row['id']).json
    assert fresh['markdown']=='Cuerpo conservado'
    assert next(p['value'] for p in fresh['meta']['properties'] if p['id']==col)==['B','D','C']

def test_board_layout_is_per_view_without_changing_records(workspace):
    client,base,parent=workspace;row=create(client,base,values={'n':0})
    before=client.get(base).json['rows'];schema=client.get(base).json['schema']
    schema['views'][1].update(groupRowOrder={'key':[row['id']]},collapsedGroups=['key'])
    assert schema_change(client,base,operation='schema',schema=schema).status_code==200
    fresh=client.get(base).json
    assert fresh['schema']['views'][1]['collapsedGroups']==['key']
    assert 'groupRowOrder' not in fresh['schema']['views'][0]
    assert fresh['rows']==before

def test_calendar_move_preserves_latest_time_zone_values_and_body(workspace):
    client,base,parent=workspace
    col=schema_change(client,base,operation='add',column={'name':'Fecha','type':'date'}).json['schema']['columns'][-1]['id']
    row=create(client,base,values={col:'2026-10-18T00:10:05+03:00','n':0})
    client.patch('/api/entry/'+row['id']+'/content',json={'raw_text':'Contenido de calendario','already_markdown':True})
    # Preserve a time edit made after the drag started on the same day.
    client.patch(base+'/rows/'+row['id'],json={'values':{col:'2026-10-18T01:11:00+03:00','text':'Última nota'}})
    move=lambda origin,target:client.patch(base+'/rows/'+row['id'],json={'date_move':{'column_id':col,'from':origin,'to':target}})
    result=move('2026-10-18','2026-10-20');assert result.status_code==200
    assert next(p['value'] for p in result.json['row']['properties'] if p['id']==col)=='2026-10-20T01:11:00+03:00'
    assert move('2026-10-18','2026-10-21').status_code==409
    assert move('2026-10-20','2026-02-31').status_code==400
    fresh=client.get('/api/entry/'+row['id']).json
    assert fresh['markdown']=='Contenido de calendario'
    assert next(p['value'] for p in fresh['meta']['properties'] if p['id']=='n')==0
    assert next(p['value'] for p in fresh['meta']['properties'] if p['id']=='text')=='Última nota'

def test_shared_rows_view_settings_reload_and_isolation(workspace):
    client,base,parent=workspace; row=create(client,base,values={'n':0,'s':'Pendiente'})
    schema=client.get(base).json['schema'];schema['activeView']='b';schema['views'][0]['hidden']=['text'];schema['views'][1]['cardSize']='large'
    assert schema_change(client,base,operation='schema',schema=schema).status_code==200
    assert client.patch(base+'/rows/'+row['id'],json={'values':{'s':'Hecho','n':12.5}}).status_code==200
    fresh=client.get(base).json
    assert len(fresh['rows'])==1 and fresh['rows'][0]['id']==row['id']
    assert [p['value'] for p in fresh['rows'][0]['properties'] if p['id']=='n']==[12.5]
    assert fresh['schema']['views'][0]['hidden']==['text'] and fresh['schema']['views'][1]['cardSize']=='large'
    second=f'/api/databases/{parent}/{B}'
    assert client.get(second).json['rows']==[]
    assert client.patch(second+'/rows/'+row['id'],json={'values':{}}).status_code==404
    assert schema_change(client,base,operation='schema',schema=dict(schema,database_id=B)).status_code==400

def test_record_presentation_persists_with_shared_page_without_changing_other_rows(workspace):
    client,base,parent=workspace
    row=create(client,base,values={'text':'Conservar','n':0});other=create(client,base)
    before=client.get(base).json
    response=client.patch(base+'/rows/'+row['id'],json=dict(presentation=dict(font='serif',small_text=True,full_width=True,property_icons=False)))
    assert response.status_code==200
    expected=dict(font='serif',small_text=True,full_width=True,property_icons=False)
    assert response.json['row']['database_presentation']==expected
    # Same metadata in a fresh source read and the normal full-page endpoint.
    assert next(r for r in client.get(base).json['rows'] if r['id']==row['id'])['database_presentation']==expected
    assert client.get('/api/entry/'+row['id']).json['meta']['database_presentation']==expected
    assert 'database_presentation' not in client.get('/api/entry/'+other['id']).json['meta']
    assert client.get(base).json['schema']==before['schema']
    assert client.patch('/api/entry/'+row['id']+'/content',json=dict(title='Título sincronizado',raw_text='## Mismo cuerpo',already_markdown=True)).status_code==200
    assert client.get('/api/entry/'+row['id']).json['meta']['database_presentation']==expected
    assert client.patch(base+'/rows/'+row['id'],json=dict(presentation=dict(small_text=False),values={'n':8.5})).status_code==200
    assert client.get('/api/entry/'+row['id']).json['meta']['database_presentation']==dict(expected,small_text=False)
    saved=client.get('/api/entry/'+row['id']).json
    for invalid in [None,[],{'font':'url(evil)'},{'small_text':1},{'property_icons':'false'},{'arbitrary':'value'}]:
        assert client.patch(base+'/rows/'+row['id'],json=dict(presentation=invalid)).status_code==400
        actual=client.get('/api/entry/'+row['id']).json
        # A GET intentionally updates visitation; that volatile timestamp is
        # unrelated to rejecting an invalid presentation patch.
        actual['meta'].pop('last_viewed_at',None);saved['meta'].pop('last_viewed_at',None)
        assert actual==saved
    assert client.patch(f'/api/databases/{parent}/{B}/rows/'+row['id'],json=dict(presentation={'font':'mono'})).status_code==404

def test_property_rename_duplicate_archive_restore_and_body(workspace):
    client,base,_=workspace;row=create(client,base,values={'text':'Conservar'})
    client.patch('/api/entry/'+row['id']+'/content',json=dict(raw_text='# Bloques\n\n- Cuerpo',already_markdown=True))
    assert schema_change(client,base,operation='configure',column_id='text',patch={'name':'Apuntes'}).status_code==200
    assert client.get(base).json['rows'][0]['properties'][0]['name']=='Apuntes'
    response=schema_change(client,base,operation='duplicate',column_id='text');assert response.status_code==200
    copied=response.json['schema']['columns'][-1]['id']
    assert next(p['value'] for p in client.get(base).json['rows'][0]['properties'] if p['id']==copied)=='Conservar'
    assert schema_change(client,base,operation='delete',column_id='text').status_code==200
    assert schema_change(client,base,operation='restore',column_id='text').status_code==200
    assert client.get('/api/entry/'+row['id']).json['markdown']=='# Bloques\n\n- Cuerpo'
    assert application.load_index()[row['id']]['properties'][0]['value']=='Conservar'

def test_conversion_backup_pending_recovery_and_conflict(workspace):
    client,base,_=workspace;row=create(client,base,values={'text':'sin número','n':0})
    before=client.get(base).json
    blocked=schema_change(client,base,operation='convert',column_id='text',type='number');assert blocked.status_code==409
    assert client.get(base).json==before
    converted=schema_change(client,base,operation='convert',column_id='text',type='number',allow_pending=True);assert converted.status_code==200
    prop=client.get(base).json['rows'][0]['properties'][0]
    assert prop['value']=='sin número' and prop['conversion_pending'] and prop['original_type']=='text'
    recovery=base+'/recoveries/'+converted.json['recovery']
    assert client.get(recovery).json['changes'][row['id']]['before']['properties'][0]['value']=='sin número'
    assert client.post(recovery).status_code==200
    assert client.get(base).json['schema']['columns'][0]['type']=='text'
    stale=client.patch(base,json=dict(revision='old',operation='delete',column_id='text'));assert stale.status_code==409
    converted=schema_change(client,base,operation='convert',column_id='text',type='number',allow_pending=True)
    client.patch(base+'/rows/'+row['id'],json=dict(values={'n':4}))
    assert client.post(base+'/recoveries/'+converted.json['recovery']).status_code==409

def test_computed_relations_rollup_button_files_and_validation(workspace):
    client,base,parent=workspace
    other=f'/api/databases/{parent}/{B}'
    schema_change(client,other,operation='add',column=dict(name='Importe',type='number'))
    target_col=client.get(other).json['schema']['columns'][0]['id'];target=create(client,other,values={target_col:7})
    relation=schema_change(client,base,operation='add',column=dict(name='Relación',type='relation',target_parent=parent,target_database=B)).json['schema']['columns'][-1]['id']
    for column in [dict(name='Suma',type='rollup',relation_id=relation,target_property=target_col,aggregation='sum'),dict(name='Doble',type='formula',expression='prop("Número") * 2'),dict(name='ID',type='id',prefix='T'),dict(name='Creado',type='created_time'),dict(name='Responsable',type='person'),dict(name='Archivo',type='files'),dict(name='Lugar',type='place'),dict(name='Hecho',type='button',action=dict(type='set',property='s',value='Hecho'))]:
        assert schema_change(client,base,operation='add',column=column).status_code==200
    row=create(client,base,values={'n':3,relation:[target['id']]})
    values={p['name']:p['value'] for p in row['properties']}
    assert values['Suma']==7 and values['Doble']==6 and values['ID'].startswith('T-') and values['Creado']
    columns={c['name']:c['id'] for c in client.get(base).json['schema']['columns']}
    assert client.patch(base+'/rows/'+row['id'],json=dict(values={relation:[row['id']]})).status_code==400
    assert client.patch(base+'/rows/'+row['id'],json=dict(values={columns['Responsable']:['unknown']})).status_code==400
    file=client.post('/api/databases/files',data={'file':(io.BytesIO(b'fixture'),'prueba.txt')},content_type='multipart/form-data');assert file.status_code==200
    assert client.get(file.json['url']).data==b'fixture'
    values={columns['Archivo']:[file.json],columns['Responsable']:['owner'],columns['Lugar']:dict(name='Tegucigalpa',lat=14.08,lng=-87.2)}
    assert client.patch(base+'/rows/'+row['id'],json=dict(values=values)).status_code==200
    assert client.post(base+'/rows/'+row['id']+'/button/'+columns['Hecho']).status_code==200
    assert next(p['value'] for p in client.get(base).json['rows'][0]['properties'] if p['id']=='s')=='Hecho'
    assert client.patch(base+'/rows/'+row['id'],json=dict(values={columns['Doble']:99})).status_code==400
    # Body/title changes do not reset metadata saved through the cell endpoint.
    client.patch('/api/entry/'+row['id']+'/content',json=dict(raw_text='## Compartido',already_markdown=True,title='Nuevo título'))
    assert next(p['value'] for p in client.get(base).json['rows'][0]['properties'] if p['id']=='s')=='Hecho'

def test_formula_sandbox_and_cycles(workspace):
    assert formula('round(prop("n") / 3, 2)',lambda _:10)==3.33
    assert formula('ifelse(prop("n"), 1 / prop("n"), 0)',lambda _:0)==0
    with pytest.raises(ValueError): formula('1e999',lambda _:0)
    for expression in ['__import__("os")','prop("n").real','[x for x in []]','"a" * 100000000']:
        with pytest.raises((ValueError,TypeError)): formula(expression,lambda _:1)
    with pytest.raises(ValueError): validate('number',float('inf'))
    client,base,_=workspace
    schema_change(client,base,operation='add',column=dict(name='Circular',type='formula',expression='prop("Circular")'))
    create(client,base)
    assert 'circular' in client.get(base).json['rows'][0]['properties'][-1]['calculation_error'].lower()

def test_deleted_records_restore_and_stale_parent_cannot_overwrite_schema(workspace):
    client,base,parent=workspace;row=create(client,base,values={'n':9})
    before=client.get('/api/entry/'+parent).json['markdown']
    assert schema_change(client,base,operation='configure',column_id='n',patch={'name':'Puntuación'}).status_code==200
    stale=client.patch('/api/entry/'+parent+'/content',json=dict(raw_text=before,already_markdown=True))
    assert stale.status_code==409
    assert client.get(base).json['schema']['columns'][1]['name']=='Puntuación'
    assert client.delete(base+'/rows/'+row['id']).status_code==200
    assert not client.get(base).json['rows']
    assert client.get(base+'/deleted').json[0]['id']==row['id']
    assert client.patch(base+'/rows/'+row['id'],json=dict(values={'n':1})).status_code==404
    assert client.post(base+'/deleted/'+row['id']).status_code==200
    assert client.get(base).json['rows'][0]['id']==row['id']
    assert client.get(base).json['rows'][0]['properties'][1]['value']==9

def test_every_writable_type_roundtrips_and_unsafe_values_reject(workspace):
    client,base,_=workspace
    samples={'text':'Contenido','number':0,'select':'Uno','multi_select':['Uno'],'status':'Uno','date':'2026-10-16',
             'person':['owner'],'files':[],'checkbox':False,'url':'https://example.com','phone':'+504 0000 0000',
             'email':'demo@example.com','relation':[],'place':dict(name='Ejemplo',lat=14.08,lng=-87.2)}
    values={}
    for kind,value in samples.items():
        col=dict(name=kind,type=kind)
        if kind in ('select','multi_select','status'): col['options']=[dict(label='Uno',color='#888888')]
        response=schema_change(client,base,operation='add',column=col)
        assert response.status_code==200,response.json
        values[response.json['schema']['columns'][-1]['id']]=value
    row=create(client,base,values=values)
    assert {p['id']:p['value'] for p in client.get(base).json['rows'][0]['properties'] if p['id'] in values}==values
    for kind,bad in [('number',True),('email','incompleto'),('date','ayer'),('checkbox','false'),('person',['externo']),('place',dict(lat=100,lng=0)),('url','javascript:alert(1)')]:
        col=next(c for c in client.get(base).json['schema']['columns'] if c['name']==kind)
        assert client.patch(base+'/rows/'+row['id'],json=dict(values={col['id']:bad})).status_code==400

def test_option_rename_keeps_values_computed_conversion_requires_acknowledgement(workspace):
    client,base,_=workspace;row=create(client,base,values={'s':'Pendiente','n':8})
    response=schema_change(client,base,operation='configure',column_id='s',patch={'options':[dict(label='Por hacer',color='#777777'),dict(label='Hecho',color='#238364')]},renames={'Pendiente':'Por hacer'})
    assert response.status_code==200
    assert next(p['value'] for p in client.get(base).json['rows'][0]['properties'] if p['id']=='s')=='Por hacer'
    assert schema_change(client,base,operation='convert',column_id='n',type='formula').status_code==409
    response=schema_change(client,base,operation='convert',column_id='n',type='formula',allow_pending=True)
    assert response.status_code==200
    assert application.load_index()[row['id']]['properties'][1]['conversion_original']['value']==8

def test_flat_legacy_presentation_is_preserved_without_writing_on_read(workspace):
    client,base,parent=workspace
    schema=dict(database_id=A,columns=[dict(id='s',name='Estado',type='status')],filter={'colId':'s','value':'No iniciado'},sort={'colId':'__title','dir':'desc'},calc={'__title':'count_all'},rowHeight='large',titleWidth=370,groupBy='s')
    raw=':::database\n'+json.dumps(schema)+'\n:::'
    assert client.patch('/api/entry/'+parent+'/content',json=dict(raw_text=raw,already_markdown=True)).status_code==200
    normalized=client.get(base).json['schema'];view=normalized['views'][0]
    assert view['filters']==[dict(colId='s',op='is',value='No iniciado')]
    assert view['sorts']==[dict(colId='title',dir='desc')]
    assert view['calculations']==dict(title='count') and view['rowHeight']=='large' and view['titleWidth']==370
    assert client.get('/api/entry/'+parent).json['markdown']==raw
    assert schema_change(client,base,operation='configure',column_id='s',patch={'name':'Progreso'}).status_code==200
    assert client.get(base).json['schema']['views'][0]==view


def test_page_read_cannot_overwrite_cell_update_or_new_record(workspace, monkeypatch):
    client,base,parent=workspace
    row=create(client,base,values={'n':0,'text':'Cuerpo de propiedad'})
    original=application.render_markdown
    created=[]
    def render_with_write(raw):
        # The old GET used a whole-index snapshot loaded before rendering.
        with application.app.test_client() as other:
            other.post('/login',data={'password':'test-password'})
            assert other.patch(base+'/rows/'+row['id'],json={'values':{'n':42}}).status_code==200
            response=other.post(base+'/rows',json={'title':'Creada durante lectura'})
            assert response.status_code==201
            created.append(response.json['row']['id'])
        return original(raw)
    monkeypatch.setattr(application,'render_markdown',render_with_write)
    response=client.get('/api/entry/'+row['id']);assert response.status_code==200
    fresh=client.get(base).json
    assert {r['id'] for r in fresh['rows']}=={row['id'],created[0]}
    assert next(p['value'] for r in fresh['rows'] if r['id']==row['id'] for p in r['properties'] if p['id']=='n')==42
    assert next(p['value'] for p in response.json['meta']['properties'] if p['id']=='n')==42


def test_concurrent_cells_bodies_and_reads_preserve_every_record(workspace):
    from concurrent.futures import ThreadPoolExecutor
    client,base,parent=workspace
    ids=[create(client,base,title='Carga '+str(i),values={'n':0,'text':'Inicial'})['id'] for i in range(24)]
    def worker(pair):
        n,identifier=pair
        with application.app.test_client() as local:
            local.post('/login',data={'password':'test-password'})
            for step in range(5):
                assert local.patch(base+'/rows/'+identifier,json={'values':{'n':n*10+step}}).status_code==200
                assert local.patch('/api/entry/'+identifier+'/content',json={'raw_text':'## Cuerpo '+str(step),'already_markdown':True}).status_code==200
                assert local.get('/api/entry/'+identifier).status_code==200
        return identifier
    with ThreadPoolExecutor(max_workers=8) as pool:assert set(pool.map(worker,enumerate(ids)))==set(ids)
    fresh=client.get(base).json['rows'];assert {r['id'] for r in fresh}==set(ids)
    for n,identifier in enumerate(ids):
        row=next(r for r in fresh if r['id']==identifier)
        assert next(p['value'] for p in row['properties'] if p['id']=='n')==n*10+4
        assert next(p['value'] for p in row['properties'] if p['id']=='text')=='Inicial'
        assert client.get('/api/entry/'+identifier).json['markdown']=='## Cuerpo 4'
    assert client.get(f'/api/databases/{parent}/{B}').json['rows']==[]


def test_option_order_does_not_change_record_values_or_body(workspace):
    client,base,parent=workspace
    row=create(client,base,values={'s':'Pendiente','n':0})
    before=client.get('/api/entry/'+row['id']).json
    col=next(c for c in client.get(base).json['schema']['columns'] if c['id']=='s')
    ordered=list(reversed(col['options']))
    assert schema_change(client,base,operation='configure',column_id='s',patch={'options':ordered},renames={}).status_code==200
    fresh=client.get(base).json
    assert next(c for c in fresh['schema']['columns'] if c['id']=='s')['options']==ordered
    assert next(p['value'] for p in fresh['rows'][0]['properties'] if p['id']=='s')=='Pendiente'
    assert client.get('/api/entry/'+row['id']).json['markdown']==before['markdown']
    assert schema_change(client,base,operation='configure',column_id='s',patch={'options':ordered},renames={'Pendiente':'Inexistente'}).status_code==400
    assert next(p['value'] for p in client.get(base).json['rows'][0]['properties'] if p['id']=='s')=='Pendiente'


def test_column_order_is_per_view_and_cannot_reorder_shared_schema(workspace):
    client,base,parent=workspace;row=create(client,base,values={'n':0,'text':'Conservar'})
    before=client.get(base).json;schema=before['schema'];columns=json.loads(json.dumps(schema['columns']))
    schema['views'][0]['columnOrder']=['s','n','text']
    assert schema_change(client,base,operation='schema',schema=schema).status_code==200
    fresh=client.get(base).json
    assert fresh['schema']['columns']==columns
    assert fresh['schema']['views'][0]['columnOrder']==['s','n','text']
    assert 'columnOrder' not in fresh['schema']['views'][1]
    assert fresh['rows'][0]['id']==row['id'] and fresh['rows'][0]['properties']==before['rows'][0]['properties']


def test_nested_filters_persist_and_invalid_tree_does_not_touch_records(workspace):
    client,base,parent=workspace;row=create(client,base,values={'n':0,'text':'Conservar'})
    schema=client.get(base).json['schema'];before=client.get(base).json['rows']
    schema['views'][0].update(filters=[{'mode':'or','rules':[{'colId':'n','op':'is','value':0},{'mode':'and','rules':[]}]}],filterTimeZone='America/Tegucigalpa')
    assert schema_change(client,base,operation='schema',schema=schema).status_code==200
    fresh=client.get(base).json;assert fresh['schema']['views'][0]['filters']==schema['views'][0]['filters']
    assert fresh['rows']==before
    deep={'colId':'n','op':'is','value':0}
    for _ in range(9):deep={'mode':'and','rules':[deep]}
    for invalid in [{'filters':[deep]},{'filters':[{'colId':'n'}]*101},{'filterTimeZone':'Invalid/Unknown'},{'filters':[{'mode':'xor','rules':[]}]}]:
        bad=json.loads(json.dumps(schema));bad['views'][0].update(invalid)
        response=schema_change(client,base,operation='schema',schema=bad)
        assert response.status_code==400,response.json
        assert client.get(base).json['schema']==fresh['schema']
        assert client.get(base).json['rows']==before
    # A widget cannot bypass the same persisted grammar/zone validation.
    bad=json.loads(json.dumps(schema));bad['views'][0]['dashboard']={'widgets':[{'view':{'filters':[deep]}}]}
    assert schema_change(client,base,operation='schema',schema=bad).status_code==400


def test_date_ranges_validate_shift_and_preserve_body_properties(workspace):
    client,base,parent=workspace
    col=schema_change(client,base,operation='add',column={'name':'Rango','type':'date'}).json['schema']['columns'][-1]['id']
    value={'start':'2026-10-18T01:10:05+03:00','end':'2026-10-20T02:11:06+03:00'}
    row=create(client,base,values={col:value,'n':0,'text':'Conservar'})
    client.patch('/api/entry/'+row['id']+'/content',json={'raw_text':'Cuerpo con rango','already_markdown':True})
    # A concurrent endpoint edit must survive moving the range by its start day.
    latest={**value,'end':'2026-10-21T03:12:07+03:00'}
    assert client.patch(base+'/rows/'+row['id'],json={'values':{col:latest}}).status_code==200
    result=client.patch(base+'/rows/'+row['id'],json={'date_move':{'column_id':col,'from':'2026-10-18','to':'2026-10-20'}})
    assert result.status_code==200,result.json
    moved={'start':'2026-10-20T01:10:05+03:00','end':'2026-10-23T03:12:07+03:00'}
    assert next(p['value'] for p in result.json['row']['properties'] if p['id']==col)==moved
    assert client.patch(base+'/rows/'+row['id'],json={'date_move':{'column_id':col,'from':'2026-10-18','to':'2026-10-20'}}).status_code==409
    for invalid in [{'start':'2026-02-31','end':'2026-03-01'},{'start':'2026-10-21','end':'2026-10-20'},{'start':'2026-10-20','end':''},{**moved,'other':'value'},{'start':'2026-10-20T18:00:00Z','end':'2026-10-20T18:00:00+03:00'},{'start':'2026-10-20T18:00:00Z','end':'2026-10-20T19:00:00'}]:
        assert client.patch(base+'/rows/'+row['id'],json={'values':{col:invalid}}).status_code==400,invalid
    fresh=client.get('/api/entry/'+row['id']).json
    assert fresh['markdown']=='Cuerpo con rango'
    assert next(p['value'] for p in fresh['meta']['properties'] if p['id']==col)==moved
    assert next(p['value'] for p in fresh['meta']['properties'] if p['id']=='n')==0
    original_meta=application.load_index()[row['id']]
    assert schema_change(client,base,operation='configure',column_id=col,patch={'date_format':'iso','time_format':'12'}).status_code==200
    assert application.load_index()[row['id']]==original_meta
    assert schema_change(client,base,operation='configure',column_id=col,patch={'date_format':'invalid'}).status_code==400
    # Converting to text serializes both endpoints; no silent loss of the end.
    response=schema_change(client,base,operation='convert',column_id=col,type='text')
    assert response.status_code==200,response.json
    converted=client.get('/api/entry/'+row['id']).json
    assert json.loads(next(p['value'] for p in converted['meta']['properties'] if p['id']==col))==moved
