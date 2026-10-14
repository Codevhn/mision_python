import json
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import app as app_module
import koboldcpp
import pytest


def test_private_proxy_discovery_chat_and_stream(monkeypatch):
    requests = []

    class Proxy(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            requests.append((self.path, None))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"data":[{"id":"local-zai"}]}')

        def do_POST(self):
            payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            requests.append((self.path, payload))
            self.send_response(200)
            self.end_headers()
            if payload.get('stream'):
                self.wfile.write(b'data: {"choices":[{"delta":{"content":"Hola"},"finish_reason":null}]}\n\n'
                                 b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
                                 b'data: [DONE]\n\n')
            else:
                self.wfile.write(b'{"choices":[{"message":{"content":"Hola"},"finish_reason":"stop"}]}')

    server = ThreadingHTTPServer(('127.0.0.1', 0), Proxy)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv('KOBOLDCPP_BASE_URL', 'http://100.64.0.9:5001/v1')
    monkeypatch.setenv('KOBOLDCPP_HTTP_PROXY', f'http://127.0.0.1:{server.server_port}')
    monkeypatch.setenv('no_proxy', '')
    try:
        models, error = koboldcpp.models()
        assert error is None and models[0]['id'] == 'local-zai'
        endpoint = koboldcpp.base_url() + '/chat/completions'
        assert app_module._call_openai_compatible(endpoint, '', 'local-zai', 'system', 'question', 128, False)[0] == 'Hola'
        assert list(app_module._call_openai_compatible_stream(endpoint, '', 'local-zai', 'system', 'question', 128)) == ['Hola']
        streamed = list(app_module._stream_openai_compatible(endpoint, '', 'local-zai', [], 128, include_usage=False))
        assert streamed[0] == 'Hola'
        assert all(url.startswith('http://100.64.0.9:5001/v1/') for url, _ in requests)
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.parametrize('local_url', ['http://100.64.0.9:5001/v1', 'file:///invalid'])
def test_proxy_does_not_intercept_other_providers(monkeypatch, local_url):
    monkeypatch.setenv('KOBOLDCPP_BASE_URL', local_url)
    monkeypatch.setenv('KOBOLDCPP_HTTP_PROXY', 'http://127.0.0.1:1056')
    expected = object()
    monkeypatch.setattr(urllib.request, 'urlopen', lambda request, timeout: expected)
    assert koboldcpp.open_request(urllib.request.Request('https://provider.example/v1/chat/completions'), 3) is expected


@pytest.mark.parametrize('proxy', ['https://127.0.0.1:1056', 'http://remote.example:1056', 'http://user:secret@127.0.0.1:1056'])
def test_private_proxy_rejects_remote_or_credential_urls(monkeypatch, proxy):
    monkeypatch.setenv('KOBOLDCPP_BASE_URL', 'http://100.64.0.9:5001/v1')
    monkeypatch.setenv('KOBOLDCPP_HTTP_PROXY', proxy)
    with pytest.raises(ValueError):
        koboldcpp.open_request(urllib.request.Request(koboldcpp.base_url() + '/models'), 3)
