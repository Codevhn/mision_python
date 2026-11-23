import json
import pytest
import app as atlas
from test_assistant import create, setup_model
from assistant_followups import suggest

ANSWER='uv permite gestionar proyectos de Python y sus dependencias. Distingue el entorno del proyecto, sus requisitos y la configuración de las herramientas. Esta es una explicación inicial.'
SUGGESTIONS={'suggestions':[{'title':'Crear un proyecto con uv','prompt':'Explica paso a paso cómo iniciar un proyecto pequeño y ejecutar su primer programa.'},{'title':'Entender el archivo de bloqueo','prompt':'Explica la relación entre los requisitos declarados y el archivo de bloqueo del proyecto.'}]}


def knowledge(client, title='uv'):
    return client.post('/api/entry',json={'entry_type':'knowledge','title':title,'category':'Programación','topic':'Python','raw_text':'Contenido original.'}).json['id']


def model(monkeypatch, failure=None, truncated=False):
    captured=[];setup_model(monkeypatch,captured)
    def call(system,prompt,**kwargs):
        if system.startswith('Propón hasta tres'):
            if failure=='raise':raise RuntimeError('offline')
            return ('invalid' if failure else json.dumps(SUGGESTIONS)),None
        return json.dumps({'claims':[]}),None
    monkeypatch.setattr(atlas,'_call_ai',call)
    monkeypatch.setattr(atlas,'_stream_call_ai',lambda *a,**k:iter([ANSWER,('__done__',truncated,None)]))


@pytest.mark.parametrize('failure',[None,'invalid','raise'])
def test_suggestions_are_separate_and_optional(auth_client,monkeypatch,failure):
    model(monkeypatch,failure);key=knowledge(auth_client);route='/api/assistant/conversations/'+create(auth_client)
    original=auth_client.get('/api/entry/'+key).json
    response=auth_client.post(route+'/messages',json={'prompt':'Explica uv','current_context':{'type':'entry','id':key}})
    assert 'event: done' in response.text
    message=auth_client.get(route).json['messages'][-1]
    assert message['content']==ANSWER
    assert bool(message.get('followups')) == (failure is None)
    if not failure:assert message['followup_entry_id']==key
    assert auth_client.get('/api/entry/'+key).json==original


def test_followup_is_bound_to_saved_suggestion_and_original_entry(auth_client,monkeypatch):
    model(monkeypatch);key=knowledge(auth_client);other=knowledge(auth_client,'pip');route='/api/assistant/conversations/'+create(auth_client)
    initial=auth_client.post(route+'/messages',json={'prompt':'Explica uv','current_context':{'type':'entry','id':key}})
    assert 'event: done' in initial.text, initial.text
    base={'prompt':'malicious unrelated prompt','knowledge_followup':{'source_index':1,'suggestion_index':0},'current_context':{'type':'entry','id':other}}
    assert auth_client.post(route+'/messages',json=base).status_code==400
    base['current_context']['id']=key
    result=auth_client.post(route+'/messages',json=base)
    assert 'event: done' in result.text
    messages=auth_client.get(route).json['messages'];question=messages[-2]
    assert question['knowledge_followup']['entry_id']==key
    assert 'malicious' not in question['content']
    assert 'Crear un proyecto con uv' in question['content']
    assert messages[-1]['truncated'] is False
    # Generation cannot write either entry on its own; the editor applies it.
    assert auth_client.get('/api/entry/'+key).json['markdown']=='Contenido original.'
    base['knowledge_followup']['suggestion_index']=9
    assert auth_client.post(route+'/messages',json=base).status_code==400


def test_sidebar_alias_is_independent_and_survives_title_saves(auth_client):
    key=knowledge(auth_client);before=auth_client.get('/api/entry/'+key).json
    path=atlas._entry_path(key,before['meta'])
    assert auth_client.patch(f'/api/entry/{key}/sidebar-label',json={'sidebar_label':'uv breve'}).status_code==200
    after=auth_client.get('/api/entry/'+key).json
    assert after['meta']['title']==before['meta']['title'] and after['markdown']==before['markdown']
    assert atlas._entry_path(key,after['meta'])==path
    tree=auth_client.get('/api/tree').json
    entries=[e for cat in tree.values() for topic in cat['_topics'].values() for e in topic.get('_entries',[])]
    assert next(e for e in entries if e['id']==key)['sidebar_label']=='uv breve'
    auth_client.patch(f'/api/entry/{key}/content',json={'title':'uv título nuevo'})
    assert auth_client.get('/api/entry/'+key).json['meta']['sidebar_label']=='uv breve'
    assert auth_client.patch(f'/api/entry/{key}/sidebar-label',json={'sidebar_label':''}).status_code==200
    assert auth_client.get('/api/entry/'+key).json['meta']['title']=='uv título nuevo'


@pytest.mark.parametrize('payload',[{},[],{'sidebar_label':None},{'sidebar_label':'x'*161},{'title':'Change'}])
def test_invalid_alias_is_rejected(auth_client,payload):
    key=knowledge(auth_client);assert auth_client.patch(f'/api/entry/{key}/sidebar-label',json=payload).status_code==400


def test_suggestion_validation_bounds_untrusted_model_output():
    raw={'suggestions':[{'title':'<script>alert(1)</script>','prompt':'Una pregunta válida de prueba'},{'title':'x','prompt':'short'},{'title':'Tema largo','prompt':'a'*601}]}
    result=suggest(lambda *a,**k:(json.dumps(raw),None),title='uv',question='uv',answer=ANSWER,provider='x',model='y')
    assert len(result)==1 # UI must render accepted text with textContent.


@pytest.mark.parametrize('flag,status',[('database_locked',423),('database_deleted',410)])
def test_alias_respects_locked_and_deleted_entries(auth_client,flag,status):
    key=knowledge(auth_client);index=atlas.load_index();index[key][flag]=True;atlas.save_index(index)
    assert auth_client.patch(f'/api/entry/{key}/sidebar-label',json={'sidebar_label':'alias'}).status_code==status
    assert 'sidebar_label' not in atlas.load_index()[key]


def test_truncated_followup_stays_a_draft(auth_client,monkeypatch):
    model(monkeypatch);key=knowledge(auth_client);route='/api/assistant/conversations/'+create(auth_client)
    assert 'event: done' in auth_client.post(route+'/messages',json={'prompt':'Explica uv','current_context':{'type':'entry','id':key}}).text
    model(monkeypatch,truncated=True)
    response=auth_client.post(route+'/messages',json={'prompt':'Profundizar','knowledge_followup':{'source_index':1,'suggestion_index':0},'current_context':{'type':'entry','id':key}})
    assert 'event: done' in response.text
    assert auth_client.get(route).json['messages'][-1]['truncated'] is True
    assert auth_client.get('/api/entry/'+key).json['markdown']=='Contenido original.'
