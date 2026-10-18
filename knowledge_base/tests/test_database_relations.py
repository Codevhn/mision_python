import app as application
from test_database_workspace import workspace,create,schema_change,B

def value(row,col):return next(p for p in row['properties'] if p['id']==col)

def related_fixture(workspace):
    client,base,parent=workspace;other=base.rsplit('/',1)[0]+'/'+B
    target_col=schema_change(client,other,operation='add',column=dict(name='Valor',type='number')).json['schema']['columns'][-1]['id']
    targets=[create(client,other,title='Destino '+str(n),values={target_col:n}) for n in [7,11]]
    rel=schema_change(client,base,operation='add',column=dict(name='Vínculos',type='relation',target_parent=parent,target_database=B)).json['schema']['columns'][-1]['id']
    total=schema_change(client,base,operation='add',column=dict(name='Total',type='rollup',relation_id=rel,target_property=target_col,aggregation='sum')).json['schema']['columns'][-1]['id']
    count=schema_change(client,base,operation='add',column=dict(name='Cuenta',type='rollup',relation_id=rel,aggregation='count')).json['schema']['columns'][-1]['id']
    row=create(client,base,values={rel:[targets[0]['id']]})
    client.patch('/api/entry/'+row['id']+'/content',json={'raw_text':'## Cuerpo protegido','already_markdown':True})
    return client,base,parent,other,targets,rel,total,count,row

def test_trash_is_diagnosed_preserved_and_restored_without_silent_rollup(workspace):
    client,base,parent,other,targets,rel,total,count,row=related_fixture(workspace)
    assert value(client.get(base).json['rows'][0],total)['value']==7
    assert client.delete(other+'/rows/'+targets[0]['id']).status_code==200
    fresh=client.get(base).json['rows'][0]
    assert value(fresh,rel)['value']==[targets[0]['id']]
    assert value(fresh,rel)['relation_issues'][0]['reason']=='deleted'
    assert value(fresh,rel)['related_records']==[]
    assert 'referencias' in value(fresh,total)['calculation_error']
    assert 'calculation_error' in value(fresh,count)
    # Add a healthy reference without discarding the trashed one; novel bad IDs reject.
    assert client.patch(base+'/rows/'+row['id'],json={'values':{rel:[t['id'] for t in targets]}}).status_code==200
    assert client.patch(base+'/rows/'+row['id'],json={'values':{rel:['not-real']}}).status_code==400
    assert client.post(other+'/deleted/'+targets[0]['id']).status_code==200
    fresh=client.get(base).json['rows'][0]
    assert value(fresh,rel)['relation_issues']==[]
    assert value(fresh,total)['value']==18 and value(fresh,count)['value']==2
    assert client.get('/api/entry/'+row['id']).json['markdown']=='## Cuerpo protegido'

def test_missing_wrong_source_and_missing_schema_remain_explicit(workspace):
    client,base,parent,other,targets,rel,total,count,row=related_fixture(workspace)
    # Simulate an old dangling ID in an isolated store; reads must not delete it.
    index=application.load_index();prop=next(p for p in index[row['id']]['properties'] if p['id']==rel)
    prop['value']=[targets[0]['id'],'legacy-missing'];application.save_index(index)
    before=application.load_index()[row['id']]['properties']
    fresh=client.get(base).json['rows'][0]
    assert value(fresh,rel)['relation_issues'][0]['reason']=='missing'
    assert application.load_index()[row['id']]['properties']==before
    assert client.patch(base+'/rows/'+row['id'],json={'values':{rel:[targets[0]['id']]}}).status_code==200
    # A deliberate target change preserves IDs but flags them as wrong_source.
    assert schema_change(client,base,operation='configure',column_id=rel,patch={'target_database':base.split('/')[-1]}).status_code==200
    assert value(client.get(base).json['rows'][0],rel)['relation_issues'][0]['reason']=='wrong_source'
    assert schema_change(client,base,operation='configure',column_id=rel,patch={'target_database':'db_'+'f'*32}).status_code==200
    fresh=client.get(base).json['rows'][0]
    assert value(fresh,rel)['relation_source_available'] is False
    assert value(fresh,rel)['relation_issues'][0]['reason']=='source_missing'
    assert 'no está disponible' in value(fresh,total)['calculation_error']
    assert client.patch(base+'/rows/'+row['id'],json={'values':{rel:[]}}).status_code==200

def test_retired_options_survive_unrelated_multiselect_edits(workspace):
    client,base,_=workspace
    col=schema_change(client,base,operation='add',column={'name':'Tags','type':'multi_select','options':[{'label':x} for x in ['Old','New','Added']]}).json['schema']['columns'][-1]['id']
    row=create(client,base,values={col:['Old','New']})
    assert schema_change(client,base,operation='configure',column_id=col,patch={'options':[{'label':'New'},{'label':'Added'}]}).status_code==200
    result=client.patch(base+'/rows/'+row['id'],json={'values':{col:['Old','New','Added']}})
    assert result.status_code==200 and value(result.json['row'],col)['value']==['Old','New','Added']
    other=create(client,base)
    assert client.patch(base+'/rows/'+other['id'],json={'values':{col:['Old']}}).status_code==400
    assert client.patch(base+'/rows/'+row['id'],json={'values':{col:['New','Added']}}).status_code==200

def test_related_schema_reads_are_bounded_per_request(workspace,monkeypatch):
    from pathlib import Path
    client,base,parent,other,targets,rel,total,count,row=related_fixture(workspace)
    for _ in range(20):create(client,base,values={rel:[targets[0]['id']]})
    path=application._entry_path(parent,application.load_index()[parent]);original=Path.read_text;reads=[]
    def measured(self,*args,**kwargs):
        if self==path:reads.append(self)
        return original(self,*args,**kwargs)
    monkeypatch.setattr(Path,'read_text',measured)
    response=client.get(base);assert response.status_code==200
    assert len(response.json['rows'])==21
    print('relation schema reads for21 rows:',len(reads))
    assert len(reads)<=3, len(reads)
