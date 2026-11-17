import json
import urllib.error
import urllib.parse

import app as app_module
import proofreading


def test_language_tool_sends_only_fragment_and_handles_emoji_offsets(auth_client, monkeypatch):
    captured = []

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def read(self, limit):
            return json.dumps({'matches': [
                {'offset': 3, 'length': 6, 'message': 'Ortografía', 'replacements': [{'value': 'prueba'}]},
                {'offset': 99, 'length': 1, 'message': 'Invalid offset', 'replacements': []},
            ]}).encode()

    def urlopen(req, **kwargs):
        captured.append(urllib.parse.parse_qs(req.data.decode()))
        return Response()

    monkeypatch.setattr(proofreading.urllib.request, 'urlopen', urlopen)
    response = auth_client.post('/api/proofreading/check', json={'text': '😀 prueva', 'mode': 'languagetool', 'context': 'must not be sent'})
    assert response.status_code == 200
    assert captured == [{'text': ['😀 prueva'], 'language': ['es'], 'enabledOnly': ['false']}]
    assert len(response.json['matches']) == 1
    assert response.json['matches'][0]['offset'] == 3


def test_ai_uses_selected_model_without_atlas_context(auth_client, monkeypatch):
    seen = []

    def call(system, text, **kwargs):
        seen.append((system, text, kwargs))
        return '¡Increíble!', None

    monkeypatch.setattr(app_module, '_call_ai', call)
    response = auth_client.post('/api/proofreading/check', json={'text': 'increible', 'mode': 'ai', 'provider': 'omniroute', 'model': 'OpenCode Zen'})
    assert response.status_code == 200
    assert response.json['corrected'] == '¡Increíble!'
    assert seen[0][1] == 'increible'
    assert seen[0][2]['provider'] == 'omniroute'
    assert seen[0][2]['model'] == 'OpenCode Zen'
    assert seen[0][2]['fail_on_truncation'] is True


def test_invalid_requests_do_not_call_services(auth_client, monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError('External service should not be called')

    monkeypatch.setattr(proofreading.urllib.request, 'urlopen', fail)
    monkeypatch.setattr(app_module, '_call_ai', fail)
    for body in [[], {}, {'text': ' '}, {'text': '\ud800'}, {'text': 'x' * 10001}, {'text': 'hola', 'mode': 'other'}, {'text': 'hola', 'mode': 'ai', 'provider': ['bad']}]:
        assert auth_client.post('/api/proofreading/check', json=body).status_code == 400


def test_service_rate_limit_keeps_fallback_available(auth_client, monkeypatch):
    def limited(*args, **kwargs):
        raise urllib.error.HTTPError('https://example.com', 429, 'Limited', {}, None)

    monkeypatch.setattr(proofreading.urllib.request, 'urlopen', limited)
    response = auth_client.post('/api/proofreading/check', json={'text': 'prueva'})
    assert response.status_code == 429
    assert 'navegador' in response.json['error']


def test_service_bad_response_and_unavailable_connection(auth_client, monkeypatch):
    def unavailable(*args, **kwargs):
        raise urllib.error.URLError('Unavailable')

    monkeypatch.setattr(proofreading.urllib.request, 'urlopen', unavailable)
    response = auth_client.post('/api/proofreading/check', json={'text': 'prueva'})
    assert response.status_code == 502
    assert 'LanguageTool' in response.json['error']


def test_authentication_is_required(client):
    assert client.post('/api/proofreading/check', json={'text': 'hola'}).status_code == 401


def test_selected_language_and_unicode_boundaries(auth_client, monkeypatch):
    captured = []

    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, limit):
            return json.dumps({'matches': [
                {'offset': 1, 'length': 1, 'replacements': [{'value': 'bad surrogate'}]},
                {'offset': 3, 'length': 6, 'message': 'Spelling', 'replacements': [{'value': 'receipt'}]},
                'invalid finding',
                {'offset': 0, 'length': 2, 'replacements': None},
            ]}).encode()

    def urlopen(req, **kwargs):
        captured.append(urllib.parse.parse_qs(req.data.decode()))
        return Response()

    monkeypatch.setattr(proofreading.urllib.request, 'urlopen', urlopen)
    response = auth_client.post('/api/proofreading/check', json={'text': '😀 recipt', 'language': 'en-US'})
    assert response.status_code == 200
    assert captured[0]['language'] == ['en-US']
    assert response.json['language'] == 'en-US'
    assert response.json['matches'] == [{'offset': 3, 'length': 6, 'message': 'Spelling', 'replacements': ['receipt']}]


def test_bad_language_never_calls_service(auth_client, monkeypatch):
    def fail(*args, **kwargs): raise AssertionError('Unexpected service request')
    monkeypatch.setattr(proofreading.urllib.request, 'urlopen', fail)
    for language in [None, [], {}, 'de', 'unknown']:
        assert auth_client.post('/api/proofreading/check', json={'text': 'hello', 'language': language}).status_code == 400


def test_english_ai_review_has_explicit_language(auth_client, monkeypatch):
    seen = []
    def call(system, text, **kwargs):
        seen.append(system)
        return 'A receipt.', None
    monkeypatch.setattr(app_module, '_call_ai', call)
    response = auth_client.post('/api/proofreading/check', json={'text': 'A reciept.', 'mode': 'ai', 'language': 'en-US'})
    assert response.status_code == 200
    assert 'corrector ortográfico de inglés' in seen[0]


def test_automatic_language_and_rule_identity(auth_client, monkeypatch):
    requests = []
    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, limit):
            return json.dumps({'matches': [{'offset': 0, 'length': 7,
                'rule': {'id': 'MORFOLOGIK_RULE_ES'},
                'replacements': [{'value': 'stagings'}]}]}).encode()
    def urlopen(req, **kwargs):
        requests.append(urllib.parse.parse_qs(req.data.decode()))
        return Response()
    monkeypatch.setattr(proofreading.urllib.request, 'urlopen', urlopen)
    response = auth_client.post('/api/proofreading/check', json={'text': 'staging', 'language': 'auto'})
    assert response.status_code == 200
    assert requests[0]['language'] == ['auto']
    assert requests[0]['preferredVariants'] == ['en-US']
    assert response.json['matches'][0]['ruleId'] == 'MORFOLOGIK_RULE_ES'
