import json
import urllib.error

import app as app_module
import koboldcpp
import pytest


class Response:
    def __init__(self, data=None, frames=None):
        self.data = data
        self.frames = frames or []
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self, *args): return json.dumps(self.data).encode()
    def __iter__(self): return iter(self.frames)


def configure(monkeypatch):
    monkeypatch.setenv('KOBOLDCPP_BASE_URL', 'http://127.0.0.1:5001')
    monkeypatch.delenv('KOBOLDCPP_API_KEY', raising=False)


@pytest.mark.parametrize('suffix', ['', '/v1', '/v1/chat/completions', '/v1/'])
def test_address_normalization(monkeypatch, suffix):
    monkeypatch.setenv('KOBOLDCPP_BASE_URL', 'http://127.0.0.1:5001' + suffix)
    assert koboldcpp.base_url() == 'http://127.0.0.1:5001/v1'


@pytest.mark.parametrize('url', ['file:///tmp/foo', 'http://user:password@host', 'https://host/?token=secret'])
def test_invalid_configuration_is_reported(auth_client, monkeypatch, url):
    monkeypatch.setenv('KOBOLDCPP_BASE_URL', url)
    assert not auth_client.get('/api/ai/koboldcpp/status').json['connected']
    with app_module.app.app_context():
        content, error = app_module._call_ai('system', 'question', provider='koboldcpp', model='test')
    assert content is None and error[1] == 400
    assert list(app_module._stream_call_ai('system', [], provider='koboldcpp', model='test'))[0][1]['status'] == 400


def test_discovery_diagnostic_and_optional_auth(auth_client, client, monkeypatch):
    configure(monkeypatch)
    captured = []
    def open_url(req, **kwargs):
        captured.append(req)
        assert kwargs['timeout'] == 3
        return Response({'data': [{'id':'gemma-4b'}, {'id':'gemma-4b'}]})
    monkeypatch.setattr(koboldcpp.urllib.request, 'urlopen', open_url)
    providers = auth_client.get('/api/ai/providers').json['providers']
    local = next(p for p in providers if p['id'] == 'koboldcpp')
    assert [m['id'] for m in local['models']] == ['gemma-4b']
    assert captured[0].full_url.endswith('/v1/models')
    assert captured[0].get_header('Authorization') is None
    monkeypatch.setenv('KOBOLDCPP_API_KEY','local-test-key')
    diagnostic = auth_client.get('/api/ai/koboldcpp/status').json
    assert diagnostic['connected'] and diagnostic['configured']
    assert captured[-1].get_header('Authorization') == 'Bearer local-test-key'
    auth_client.get('/logout')
    assert auth_client.get('/api/ai/koboldcpp/status').status_code == 401


def test_offline_provider_is_not_advertised(auth_client, monkeypatch):
    configure(monkeypatch)
    monkeypatch.setattr(koboldcpp.urllib.request, 'urlopen', lambda *a, **k: (_ for _ in ()).throw(OSError('private connection down')))
    data = auth_client.get('/api/ai/providers').json
    assert not any(p['id']=='koboldcpp' for p in data['providers'])
    assert any(w['provider']=='koboldcpp' for w in data['warnings'])
    assert not auth_client.get('/api/ai/koboldcpp/status').json['connected']


def test_nonstream_and_stream_compatible_payloads(auth_client, monkeypatch):
    configure(monkeypatch)
    captured = []
    def open_url(req, **kwargs):
        payload = json.loads(req.data); captured.append(payload)
        assert req.get_header('Authorization') is None
        if payload.get('stream'):
            return Response(frames=[b'data: {"choices":[{"delta":{"content":"Hola"},"finish_reason":null}]}\n', b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n', b'data: [DONE]\n'])
        return Response({'choices':[{'message':{'content':'{"valid":true}'},'finish_reason':'stop'}]})
    monkeypatch.setattr(app_module.urllib.request, 'urlopen', open_url)
    with app_module.app.app_context():
        content, err = app_module._call_ai('system', 'question', json_mode=True, provider='koboldcpp', model='gemma-4b', max_tokens=4000)
    assert err is None and json.loads(content)['valid']
    parts = list(app_module._stream_call_ai('system', [{'role':'user','content':'question'}], provider='koboldcpp', model='gemma-4b', max_tokens=4000))
    assert parts[0] == 'Hola' and parts[-1][0] == '__done__'
    assert 'response_format' not in captured[0] and 'stream_options' not in captured[1]
    assert all(p['max_tokens']==1024 for p in captured)
    assert list(app_module._stream_ai('system','question',provider='koboldcpp', model='gemma-4b')) == ['Hola']


def test_local_failure_never_falls_back_to_paid_provider(auth_client, monkeypatch):
    configure(monkeypatch)
    calls=[]
    def fake_call(*a, provider=None, **kw):
        calls.append(provider)
        return None, (app_module.jsonify({'error':'offline'}),503)
    monkeypatch.setattr(app_module,'_call_ai',fake_call)
    monkeypatch.setenv('DEEPSEEK_API_KEY','paid-test-key')
    with app_module.app.app_context():
        result = app_module._call_ai_with_fallback('system','question',provider='koboldcpp',model='gemma-4b')
    assert calls == ['koboldcpp'] and result[1] == 'offline'
    assert all(pid != 'koboldcpp' for pid, _ in app_module._list_available_ai_models())


def test_assistant_accepts_local_without_api_key(auth_client, monkeypatch):
    configure(monkeypatch)
    monkeypatch.setattr(app_module, '_stream_call_ai', lambda *a,**kw: iter(['Respuesta local', ('__done__',False,None)]))
    conversation=auth_client.post('/api/assistant/conversations',json={}).json['id']
    response=auth_client.post('/api/assistant/conversations/'+conversation+'/messages',json={'prompt':'Explica pip','provider':'koboldcpp','model':'gemma-4b','use_atlas':False})
    assert response.status_code == 200
    assert 'Respuesta local' in response.get_data(as_text=True)
