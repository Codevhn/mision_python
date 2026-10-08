import json

import app as app_module


def create(client, notation="flow", mode="socratic"):
    r = client.post('/api/diagrams', json={"title": "Registro", "notation": notation, "config": {"mode": mode, "goal": "Representar registro de usuario"}})
    assert r.status_code == 201
    return r.json


def node(nid='n1', shape='start'):
    return {"id": nid, "shape": shape, "label": "Inicio", "x": 20, "y": 20}


def fake(monkeypatch, result):
    captured = []
    def call(system, prompt, **kwargs):
        captured.append((system, json.loads(prompt), kwargs))
        return json.dumps(result), None
    monkeypatch.setattr(app_module, '_call_ai', call)
    return captured


def test_auth_required(client):
    assert client.get('/api/diagrams').status_code in (302, 401)


def test_save_reload_config_history_and_delete(auth_client):
    c = auth_client
    s = create(c)
    doc = s['document']
    doc['nodes'] = [node()]
    doc['config'].update(level='advanced', depth='deep', mode='manual')
    saved = c.put('/api/diagrams/'+s['id'], json={'revision':s['revision'],'document':doc})
    assert saved.status_code == 200
    s2 = c.get('/api/diagrams/'+s['id']).json
    assert s2['document']['nodes'][0]['id'] == 'n1'
    assert s2['document']['config']['depth'] == 'deep'
    assert s2['revision'] == 2
    assert c.get('/api/diagrams').json[0]['title'] == 'Registro'
    assert c.delete('/api/diagrams/'+s['id'], json={'revision':2}).status_code == 200
    assert c.get('/api/diagrams/'+s['id']).status_code == 404


def test_invalid_references_and_notation_leave_saved_document(auth_client):
    s = create(auth_client)
    doc = s['document']
    doc['nodes'] = [node()]
    doc['edges'] = [{'id':'e','from':'n1','to':'missing','kind':'flow'}]
    assert auth_client.put('/api/diagrams/'+s['id'], json={'revision':1,'document':doc}).status_code == 400
    doc['edges'] = []
    doc['nodes'][0]['shape'] = 'class'
    assert auth_client.put('/api/diagrams/'+s['id'], json={'revision':1,'document':doc}).status_code == 400
    actual = auth_client.get('/api/diagrams/'+s['id']).json
    assert actual['revision'] == 1 and actual['document']['nodes'] == []


def test_revision_prevents_lost_updates(auth_client):
    s = create(auth_client)
    auth_client.put('/api/diagrams/'+s['id'], json={'revision':1,'document':s['document']})
    assert auth_client.put('/api/diagrams/'+s['id'], json={'revision':1,'document':s['document']}).status_code == 409
    assert auth_client.delete('/api/diagrams/'+s['id'], json={'revision':1}).status_code == 409


def test_mentor_proposal_is_not_applied_until_confirmed(auth_client, monkeypatch):
    calls = fake(monkeypatch, {'message':'El inicio marca la entrada.','question':'¿Qué acción ocurre después?', 'proposals':[{'title':'Añadir inicio','reason':'Punto de entrada acordado','operations':[{'op':'add_node','value':node()}]}]})
    s = create(auth_client)
    r = auth_client.post('/api/diagrams/'+s['id']+'/assist', json={'revision':1,'action':'answer','message':'Empieza cuando el usuario abre registro','provider':'deepseek','model':'chosen-model'})
    assert r.status_code == 200
    proposed = r.json
    assert proposed['document']['nodes'] == []
    assert proposed['conversation'][-1]['question']
    assert calls[0][1]['document']['config']['goal'] == 'Representar registro de usuario'
    assert calls[0][2]['model'] == 'chosen-model'
    p = proposed['proposals'][0]
    applied = auth_client.post(f"/api/diagrams/{s['id']}/proposals/{p['id']}", json={'revision':2,'decision':'apply'})
    assert applied.status_code == 200
    assert applied.json['document']['nodes'][0]['id'] == 'n1'
    assert applied.json['decisions'][0]['reason'] == 'Punto de entrada acordado'
    assert applied.json['proposals'] == []


def test_socratic_cannot_replace_graph_without_solution_request(auth_client, monkeypatch):
    fake(monkeypatch, {'message':'Diagrama completo','proposals':[{'title':'Todo','operations':[{'op':'replace_graph','value':{'nodes':[node()],'edges':[]}}]}]})
    s = create(auth_client)
    payload={'revision':1,'action':'answer','message':'Inicio'}
    assert auth_client.post('/api/diagrams/'+s['id']+'/assist', json=payload).status_code == 502
    payload['action']='solution'
    assert auth_client.post('/api/diagrams/'+s['id']+'/assist', json=payload).status_code == 200
    assert auth_client.get('/api/diagrams/'+s['id']).json['document']['nodes'] == []


def test_hint_preserves_document_and_carries_fresh_history(auth_client, monkeypatch):
    calls = fake(monkeypatch, {'message':'Piensa en la condición de salida.','question':'¿Qué permite avanzar?','proposals':[]})
    s = create(auth_client)
    r = auth_client.post('/api/diagrams/'+s['id']+'/assist', json={'revision':1,'action':'hint'})
    assert r.status_code == 200 and not r.json['proposals']
    r2 = auth_client.post('/api/diagrams/'+s['id']+'/assist', json={'revision':2,'action':'answer','message':'Un correo válido'})
    assert r2.status_code == 200
    assert calls[1][1]['history'][-1]['question'] == '¿Qué permite avanzar?'
    assert calls[1][1]['message'] == 'Un correo válido'


def test_edit_invalidates_pending_proposal(auth_client, monkeypatch):
    fake(monkeypatch, {'message':'Propuesta','proposals':[{'title':'Inicio','operations':[{'op':'add_node','value':node()}]}]})
    s = create(auth_client)
    proposed = auth_client.post('/api/diagrams/'+s['id']+'/assist', json={'revision':1,'action':'answer','message':'Inicio'}).json
    p = proposed['proposals'][0]
    changed = auth_client.put('/api/diagrams/'+s['id'], json={'revision':2,'document':s['document']})
    assert changed.status_code == 200 and changed.json['proposals']==[]
    assert auth_client.post(f"/api/diagrams/{s['id']}/proposals/{p['id']}", json={'revision':2,'decision':'apply'}).status_code == 409
    assert auth_client.post(f"/api/diagrams/{s['id']}/proposals/{p['id']}", json={'revision':3,'decision':'apply'}).status_code == 404


def test_model_error_does_not_modify_state(auth_client, monkeypatch):
    monkeypatch.setattr(app_module,'_call_ai',lambda *a,**kw: ('not valid JSON',None))
    s = create(auth_client)
    assert auth_client.post('/api/diagrams/'+s['id']+'/assist', json={'revision':1,'action':'generate'}).status_code == 502
    saved = auth_client.get('/api/diagrams/'+s['id']).json
    assert saved['revision']==1 and saved['conversation']==[]


def test_uml_relationship_and_flow_draft_warnings(auth_client):
    s = create(auth_client, 'class')
    doc = s['document']
    doc['nodes'] = [node('a','class'), node('b','interface')]
    doc['edges'] = [{'id':'e','from':'a','to':'b','kind':'implementation','targetMultiplicity':'1'}]
    r = auth_client.put('/api/diagrams/'+s['id'], json={'revision':1,'document':doc})
    assert r.status_code==200 and not r.json['warnings']
    f = create(auth_client)
    f['document']['nodes']=[node('d','decision')]
    r = auth_client.put('/api/diagrams/'+f['id'], json={'revision':1,'document':f['document']})
    assert r.status_code==200
    assert any('Decisión' in w for w in r.json['warnings'])


def test_mentor_slow_response_does_not_overwrite_concurrent_edit(auth_client, monkeypatch):
    s = create(auth_client)
    def call(*args, **kwargs):
        changed = dict(s['document'], title='Título editado mientras responde')
        other = app_module.app.test_client()
        other.post('/login', data={'password':'test-password'})
        assert other.put('/api/diagrams/'+s['id'],json={'revision':1,'document':changed}).status_code==200
        return json.dumps({'message':'Pregunta antigua','proposals':[]}),None
    monkeypatch.setattr(app_module,'_call_ai',call)
    r=auth_client.post('/api/diagrams/'+s['id']+'/assist',json={'revision':1,'action':'start'})
    assert r.status_code==409
    assert auth_client.get('/api/diagrams/'+s['id']).json['document']['title']=='Título editado mientras responde'


def test_bad_request_body_returns_validation_error(auth_client):
    s=create(auth_client)
    assert auth_client.post('/api/diagrams',json=['bad']).status_code==400
    assert auth_client.post('/api/diagrams/'+s['id']+'/assist',json=['bad']).status_code==400
    assert auth_client.post('/api/diagrams/'+s['id']+'/proposals/missing',json=['bad']).status_code==400


def test_socratic_step_cannot_sneak_full_graph_in_additions(auth_client,monkeypatch):
    fake(monkeypatch,{'message':'Solución sin pedir','proposals':[{'title':'Flujo completo','operations':[{'op':'add_node','value':node('a')},{'op':'add_node','value':node('b','end')}]}]})
    s=create(auth_client)
    r=auth_client.post('/api/diagrams/'+s['id']+'/assist',json={'revision':1,'action':'answer','message':'Que empiece'})
    assert r.status_code==502
    assert auth_client.get('/api/diagrams/'+s['id']).json['revision']==1


def test_discard_and_mode_switch_keep_learning_context(auth_client,monkeypatch):
    calls=fake(monkeypatch,{'message':'Un paso','question':'¿Por qué?','proposals':[{'title':'Inicio','operations':[{'op':'add_node','value':node()}]}]})
    s=create(auth_client)
    proposed=auth_client.post('/api/diagrams/'+s['id']+'/assist',json={'revision':1,'action':'answer','message':'Inicio'}).json
    r=auth_client.post(f"/api/diagrams/{s['id']}/proposals/{proposed['proposals'][0]['id']}",json={'revision':2,'decision':'discard'})
    assert r.status_code==200 and r.json['document']['nodes']==[]
    doc=r.json['document'];doc['config']['mode']='guided';doc['nodes']=[node()]
    saved=auth_client.put('/api/diagrams/'+s['id'],json={'revision':3,'document':doc})
    assert saved.json['conversation'][-1]['question']=='¿Por qué?'
    fake(monkeypatch,{'message':'El inicio es la entrada.','proposals':[]})
    r=auth_client.post('/api/diagrams/'+s['id']+'/assist',json={'revision':4,'action':'explain','selection':'n1'})
    assert r.status_code==200 and r.json['document']['config']['mode']=='guided'


def test_hint_cannot_apply_proposal_and_provider_error_is_preserved(auth_client,monkeypatch):
    fake(monkeypatch,{'message':'Pista','proposals':[{'title':'Completar','operations':[{'op':'add_node','value':node()}]}]})
    s=create(auth_client)
    assert auth_client.post('/api/diagrams/'+s['id']+'/assist',json={'revision':1,'action':'hint'}).status_code==502
    from flask import jsonify
    monkeypatch.setattr(app_module,'_call_ai',lambda *a,**kw:(None,(jsonify(error='No disponible'),503)))
    r=auth_client.post('/api/diagrams/'+s['id']+'/assist',json={'revision':1,'action':'answer','message':'Inicio'})
    assert r.status_code==503 and r.json['error']=='No disponible'
    assert auth_client.get('/api/diagrams/'+s['id']).json['revision']==1


def test_repeated_mentor_question_is_saved_once(auth_client,monkeypatch):
    question='¿Podrías describir el proceso de login paso a paso?'
    fake(monkeypatch,{'message':question,'question':question,'proposals':[]})
    s=create(auth_client)
    r=auth_client.post('/api/diagrams/'+s['id']+'/assist',json={'revision':1,'action':'start'})
    assert r.status_code==200
    turn=r.json['conversation'][-1]
    assert turn['content']=='' and turn['question']==question
    saved=auth_client.get('/api/diagrams/'+s['id']).json['conversation'][-1]
    assert saved==turn


def test_dedup_keeps_explanation_and_handles_formatting(auth_client,monkeypatch):
    question='¿Qué debe ocurrir después?'
    fake(monkeypatch,{'message':'El inicio representa la entrada.\n\n**¿Qué debe  ocurrir después?**','question':question,'proposals':[]})
    s=create(auth_client)
    r=auth_client.post('/api/diagrams/'+s['id']+'/assist',json={'revision':1,'action':'start'})
    assert r.status_code==200
    assert r.json['conversation'][-1]['content']=='El inicio representa la entrada.'
    assert r.json['conversation'][-1]['question']==question


def test_existing_saved_conversation_is_deduplicated_on_read(auth_client):
    import sqlite3
    s=create(auth_client)
    question='¿Qué condición permite avanzar?'
    with sqlite3.connect(app_module.INDEX_DB_FILE) as conn:
        row=conn.execute('SELECT payload FROM atlas_diagrams WHERE id=?',(s['id'],)).fetchone()
        payload=json.loads(row[0])
        payload['conversation']=[{'role':'assistant','content':question,'question':question}]
        conn.execute('UPDATE atlas_diagrams SET payload=? WHERE id=?',(json.dumps(payload),s['id']))
    r=auth_client.get('/api/diagrams/'+s['id'])
    assert r.status_code==200 and r.json['revision']==1
    assert r.json['conversation'][0]=={'role':'assistant','content':'','question':question}


def test_question_dedup_does_not_remove_related_explanation(auth_client,monkeypatch):
    fake(monkeypatch,{'message':'Primero hay que entender por qué.','question':'¿Por qué?','proposals':[]})
    s=create(auth_client)
    r=auth_client.post('/api/diagrams/'+s['id']+'/assist',json={'revision':1,'action':'start'})
    assert r.status_code==200
    assert r.json['conversation'][-1]['content']=='Primero hay que entender por qué.'
    assert r.json['conversation'][-1]['question']=='¿Por qué?'
