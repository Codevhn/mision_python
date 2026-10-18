import json
import pytest
from test_database_workspace import workspace,create,schema_change,A,B

def test_duplicate_preserves_properties_body_but_uses_independent_uid_and_nested_sources(workspace):
    client,base,parent=workspace;row=create(client,base,values={'text':'Conservar','n':0})
    nested={'database_id':'db_'+'e'*32,'columns':[],'views':[{'id':'v','name':'Tabla','type':'table'}]}
    body='# Cuerpo\n\n:::database\n'+json.dumps(nested)+'\n:::'
    client.patch('/api/entry/'+row['id']+'/content',json={'raw_text':body,'already_markdown':True})
    result=client.post(base+'/rows/'+row['id']+'/duplicate',json={})
    assert result.status_code==201
    copied=result.json['row'];assert copied['id']!=row['id'] and copied['uid']!=row['uid']
    assert copied['database_id']==A and copied['parent_id']==parent
    assert next(p['value'] for p in copied['properties'] if p['id']=='n')==0
    assert client.get('/api/entry/'+copied['id']).json['markdown']!=body
    assert client.get('/api/entry/'+row['id']).json['markdown']==body
    assert client.get(f'/api/databases/{parent}/{B}').json['rows']==[]

def test_move_requires_explicit_preservation_keeps_id_body_and_supports_guarded_undo(workspace):
    client,base,parent=workspace;row=create(client,base,values={'text':'Sin pérdida','n':8.5})
    client.patch('/api/entry/'+row['id']+'/content',json={'raw_text':'## Página propia','already_markdown':True})
    route=base+'/rows/'+row['id']+'/move';target={'target_parent':parent,'target_database':B}
    preview=client.post(route,json=dict(target,preview=True)).json
    assert len(preview['unmapped'])==2
    assert client.post(route,json=dict(target,revision=preview['revision'])).status_code==409
    moved=client.post(route,json=dict(target,revision=preview['revision'],preserve_unmapped=True))
    assert moved.status_code==200
    assert client.get(base).json['rows']==[]
    other=f'/api/databases/{parent}/{B}';record=client.get(other).json['rows'][0]
    assert record['id']==row['id'] and record['uid']==row['uid']
    assert {p['name']:p['value'] for p in record['database_unmapped_properties']}=={'Nota':'Sin pérdida','Número':8.5}
    assert client.get('/api/entry/'+row['id']).json['markdown']=='## Página propia'
    restore=other+'/rows/'+row['id']+'/transfers/'+moved.json['recovery']+'/restore'
    assert client.post(restore,json={}).status_code==200
    assert client.get(base).json['rows'][0]['properties'][0]['value']=='Sin pérdida'
    # Move again and change something: undo must not discard those later edits.
    preview=client.post(route,json=dict(target,preview=True)).json
    moved=client.post(route,json=dict(target,revision=preview['revision'],preserve_unmapped=True))
    client.patch(other+'/rows/'+row['id'],json={'title':'Cambio posterior'})
    assert client.post(other+'/rows/'+row['id']+'/transfers/'+moved.json['recovery']+'/restore',json={}).status_code==409

def test_move_matches_compatible_names_and_rehydrates_preserved_values_when_moving_back(workspace):
    client,base,parent=workspace;other=f'/api/databases/{parent}/{B}'
    schema_change(client,other,operation='add',column={'name':'Número','type':'number'})
    row=create(client,base,values={'text':'Pendiente de equivalencia','n':0})
    def move(origin,destination):
        route=origin+'/rows/'+row['id']+'/move';body={'target_parent':parent,'target_database':destination}
        preview=client.post(route,json=dict(body,preview=True)).json
        return client.post(route,json=dict(body,revision=preview['revision'],preserve_unmapped=True))
    result=move(base,B);assert result.status_code==200
    assert next(p['value'] for p in result.json['row']['properties'] if p['name']=='Número')==0
    result=move(other,A);assert result.status_code==200
    assert next(p['value'] for p in result.json['row']['properties'] if p['id']=='text')=='Pendiente de equivalencia'
    assert result.json['row']['database_unmapped_properties']==[]

def test_lock_guards_content_cells_and_buttons_but_can_be_unlocked(workspace):
    client,base,_=workspace;row=create(client,base,values={'n':3});route=base+'/rows/'+row['id']
    schema_change(client,base,operation='add',column={'name':'Terminar','type':'button','action':{'type':'set','property':'s','value':'Hecho'}})
    button=client.get(base).json['schema']['columns'][-1]['id']
    assert client.patch(route,json={'locked':True}).status_code==200
    assert client.patch(route,json={'values':{'n':5}}).status_code==423
    assert client.post(route+'/button/'+button,json={}).status_code==423
    assert client.patch('/api/entry/'+row['id']+'/content',json={'raw_text':'No permitido','already_markdown':True}).status_code==423
    assert client.get('/api/entry/'+row['id']).json['markdown']==''
    assert client.put('/api/entry/'+row['id'],json={'raw_text':'No permitido'}).status_code==423
    assert client.patch('/api/entry/'+row['id']+'/properties',json={'properties':[]}).status_code==423
    assert client.patch(route,json={'favorite':True}).json['row']['starred']
    assert client.patch(route,json={'locked':False}).status_code==200
    assert client.patch(route,json={'values':{'n':5}}).status_code==200

def test_layout_is_shared_persistent_independent_of_views_and_isolated(workspace):
    client,base,parent=workspace;create(client,base);before=client.get(base).json
    layout={'structure':'tabbed','order':['n','text','s'],'hidden':['text'],'panel':['s'],'property_icons':False}
    result=schema_change(client,base,operation='page_layout',layout=layout,expected_layout=None)
    assert result.status_code==200
    assert client.get(base).json['schema']['page_layout']==layout
    assert client.get(base).json['schema']['views']==before['schema']['views']
    assert 'page_layout' not in client.get(f'/api/databases/{parent}/{B}').json['schema']
    assert schema_change(client,base,operation='page_layout',layout=layout,expected_layout=None).status_code==409
    for invalid in [dict(layout,order=['n','n']),dict(layout,panel=['missing']),dict(layout,panel=['text']),dict(layout,structure='unknown')]:
        assert schema_change(client,base,operation='page_layout',layout=invalid).status_code==400

def test_content_history_restores_only_body_with_conflict_and_lock_guards(workspace):
    client,base,_=workspace;row=create(client,base,values={'n':8.5});route=base+'/rows/'+row['id']
    entry='/api/entry/'+row['id']+'/content'
    for body in ('# Primera versión','## Segunda versión'):
        assert client.patch(entry,json={'raw_text':body,'already_markdown':True}).status_code==200
    history=client.get(route+'/content-history').json
    versions=[(v,client.get(route+'/content-history/'+v['timestamp']).json) for v in history['versions']]
    selected=next(v for v,detail in versions if detail['markdown']=='# Primera versión')
    restore=route+'/content-history/'+selected['timestamp']
    assert client.post(restore,json={'revision':'stale'}).status_code==409
    client.patch(route,json={'locked':True})
    assert client.post(restore,json={'revision':history['revision']}).status_code==423
    client.patch(route,json={'locked':False})
    assert client.post(restore,json={'revision':history['revision']}).status_code==200
    assert client.get('/api/entry/'+row['id']).json['markdown']=='# Primera versión'
    assert next(p['value'] for p in client.get(base).json['rows'][0]['properties'] if p['id']=='n')==8.5
    assert client.delete(route).status_code==200
    assert client.patch(entry,json={'raw_text':'No resucitar','already_markdown':True}).status_code==410


def test_move_archives_computed_result_and_definition_without_cross_source_restore(workspace):
    client,base,parent=workspace
    schema_change(client,base,operation='add',column={'name':'Doble','type':'formula','expression':'prop("Número") * 2'})
    row=create(client,base,values={'n':8.5});route=base+'/rows/'+row['id']+'/move'
    target={'target_parent':parent,'target_database':B}
    preview=client.post(route,json=dict(target,preview=True)).json
    preserved=next(p for p in preview['unmapped'] if p['name']=='Doble')
    assert preserved['value']==17 and preserved['definition']['expression']=='prop("Número") * 2'
    moved=client.post(route,json=dict(target,revision=preview['revision'],preserve_unmapped=True))
    recovery=moved.json['recovery']
    assert client.post(base+'/rows/'+row['id']+'/transfers/'+recovery+'/restore',json={}).status_code==404
    other=f'/api/databases/{parent}/{B}'
    duplicate=client.post(other+'/rows/'+row['id']+'/duplicate',json={}).json['row']
    assert 'database_last_transfer' not in duplicate
    assert next(p for p in duplicate['database_unmapped_properties'] if p['name']=='Doble')['value']==17


def test_export_is_an_owned_download_with_body_schema_and_preserved_values(workspace):
    client,base,parent=workspace;row=create(client,base,values={'n':0,'text':'Conservar'})
    client.patch('/api/entry/'+row['id']+'/content',json={'raw_text':'## Cuerpo exacto','already_markdown':True})
    route=base+'/rows/'+row['id']+'/export'
    result=client.get(route+'?format=json')
    assert result.status_code==200 and 'attachment' in result.headers['Content-Disposition']
    assert 'no-store' in result.headers['Cache-Control']
    assert result.json['row']['id']==row['id'] and result.json['schema']['database_id']==A
    assert result.json['markdown']=='## Cuerpo exacto'
    assert client.get(route+'?format=markdown').get_data(as_text=True).endswith('## Cuerpo exacto')
    assert client.get(f'/api/databases/{parent}/{B}/rows/{row["id"]}/export').status_code==404
    assert client.get(route+'?format=invalid').status_code==400
