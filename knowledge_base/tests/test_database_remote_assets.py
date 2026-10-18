"""No real DNS/network in these tests; exercise pinning, limits and redirects."""
import io
import socket
import pytest
import database_remote_assets as remote

class Sock:
    def __init__(self): self.closed=False
    def settimeout(self, value): assert value>0
    def shutdown(self, how): pass
    def close(self): self.closed=True

class Response:
    def __init__(self, status=200, body=b'PNG exact bytes', headers=None):
        self.status=status;self.headers=headers or {};self.stream=io.BytesIO(body)
    def getheader(self,key,default=None): return self.headers.get(key,default)
    def read1(self,n): return self.stream.read(n)

@pytest.fixture
def transport(monkeypatch):
    observed={'dns':[],'connect':[],'requests':[],'tls':[],'responses':[]}
    def resolve(host,port,*args):
        observed['dns'].append(host)
        ip='127.0.0.1' if host=='private.invalid' else '93.184.216.34'
        return [(socket.AF_INET,socket.SOCK_STREAM,6,'',(ip,port))]
    def connect(address,timeout):observed['connect'].append(address);return Sock()
    class Connection:
        def __init__(self,host,port,**kwargs):self.host=host;self.sock=None
        def request(self,method,path,headers):observed['requests'].append((self.host,path,headers))
        def getresponse(self):return observed['responses'].pop(0) if observed['responses'] else Response()
        def close(self):
            if self.sock:self.sock.close()
    class TLS:
        check_hostname=True
        verify_mode=2
        def wrap_socket(self,sock,server_hostname):observed['tls'].append(server_hostname);return sock
    monkeypatch.setattr(remote.socket,'getaddrinfo',resolve);monkeypatch.setattr(remote.socket,'create_connection',connect)
    monkeypatch.setattr(remote.ssl,'create_default_context',TLS)
    monkeypatch.setattr(remote.http.client,'HTTPConnection',Connection);monkeypatch.setattr(remote.http.client,'HTTPSConnection',Connection)
    return observed


def test_pins_public_ip_keeps_hostname_tls_and_sends_no_credentials(transport):
    body,mime,url=remote.fetch_remote_asset('https://public.invalid/image.png?size=2',100)
    assert body==b'PNG exact bytes'
    assert transport['connect']==[('93.184.216.34',443)]
    assert transport['tls']==['public.invalid']
    host,path,headers=transport['requests'][0]
    assert host=='public.invalid' and path=='/image.png?size=2'
    assert 'Cookie' not in headers and 'Authorization' not in headers


@pytest.mark.parametrize('url,reason',[
    ('https://private.invalid/a','remote_private_address_blocked'),
    ('http://public.invalid:999/a','remote_port_blocked'),
    ('https://user:secret@public.invalid/a','remote_url_invalid'),
    ('file:///etc/passwd','remote_url_invalid'),
    ('https://public.invalid/a\r\nX:Y','remote_url_invalid'),
    ('https://[broken/a','remote_url_invalid'),
])
def test_rejects_invalid_destinations_before_connect(transport,url,reason):
    with pytest.raises(remote.RemoteAssetError,match=reason):remote.fetch_remote_asset(url,100)
    assert not transport['connect']


def test_redirect_revalidates_and_forbids_tls_downgrade(transport):
    transport['responses']=[Response(302,headers={'Location':'https://private.invalid/secret'})]
    with pytest.raises(remote.RemoteAssetError,match='remote_private_address_blocked'):
        remote.fetch_remote_asset('https://public.invalid/start',100)
    assert len(transport['connect'])==1
    transport['responses']=[Response(302,headers={'Location':'http://public.invalid/plain'})]
    with pytest.raises(remote.RemoteAssetError,match='remote_tls_downgrade_blocked'):
        remote.fetch_remote_asset('https://public.invalid/start',100)


def test_header_and_stream_limits_and_http_failure(transport):
    for response,reason in [(Response(headers={'Content-Length':'999'}),'remote_asset_too_large'),(Response(body=b'123456'),'remote_asset_too_large'),(Response(401),'remote_http_401')]:
        transport['responses']=[response]
        with pytest.raises(remote.RemoteAssetError,match=reason):remote.fetch_remote_asset('https://public.invalid/a',5)


def test_every_dns_address_must_be_public(monkeypatch):
    monkeypatch.setattr(remote.socket,'getaddrinfo',lambda *args:[(socket.AF_INET,socket.SOCK_STREAM,6,'',('93.184.216.34',443)),(socket.AF_INET,socket.SOCK_STREAM,6,'',('10.0.0.1',443))])
    with pytest.raises(remote.RemoteAssetError,match='remote_private_address_blocked'):remote.public_addresses('mixed.invalid',443,1)
