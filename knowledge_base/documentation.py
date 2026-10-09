"""Bounded HTTPS documentation retrieval; fetched material is untrusted evidence."""
import http.client
import ipaddress
import socket
import ssl
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit, urljoin, urlunsplit

MAX_SOURCES = 3


def validate_urls(urls):
    if not isinstance(urls, list) or len(urls) > MAX_SOURCES:
        raise ValueError('Usa hasta tres enlaces de documentación.')
    result = []
    for url in urls:
        if not isinstance(url, str) or len(url) > 2000:
            raise ValueError('Enlace de documentación no válido.')
        p = urlsplit(url.strip())
        if p.scheme != 'https' or not p.hostname or p.username or p.password or p.port not in (None, 443):
            raise ValueError('Usa enlaces HTTPS sin credenciales ni puertos personalizados.')
        clean = urlunsplit((p.scheme, p.netloc, p.path or '/', p.query, ''))
        if clean not in result:
            result.append(clean)
    return result


class DocumentText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.main = 0
        self.all_text = []
        self.main_text = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'nav', 'footer', 'header'):
            self.hidden += 1
        if tag == 'main':
            self.main += 1
        if tag in ('p', 'li', 'pre', 'h1', 'h2', 'h3', 'br'):
            self.handle_data('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'nav', 'footer', 'header'):
            self.hidden = max(0, self.hidden - 1)
        if tag == 'main':
            self.main = max(0, self.main - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.all_text.append(data)
            if self.main:
                self.main_text.append(data)

    def text(self):
        return re.sub(r'[ \t]+', ' ', ''.join(self.main_text or self.all_text)).strip()


def public_address(host):
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
        raise ValueError('La fuente no apunta a un servidor público permitido.')
    return addresses[0][4][0]


class PinnedHTTPS(http.client.HTTPSConnection):
    """Connect to the validated IP, retaining hostname certificate checks/SNI."""
    def __init__(self, host, address):
        super().__init__(host, timeout=4, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        sock = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except Exception:
            sock.close()
            raise


def fetch_document(url):
    current = validate_urls([url])[0]
    for _ in range(3):
        p = urlsplit(current)
        address = public_address(p.hostname)
        conn = PinnedHTTPS(p.hostname, address)
        try:
            conn.request('GET', p.path + ('?' + p.query if p.query else ''), headers={
                'User-Agent': 'Atlas-Documentation/1.0', 'Accept': 'text/html,text/plain', 'Accept-Encoding': 'identity'})
            response = conn.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                if not location:
                    raise ValueError('Redirección sin destino.')
                current = validate_urls([urljoin(current, location)])[0]
                continue
            if response.status != 200:
                raise ValueError(f'La fuente respondió HTTP {response.status}.')
            mime = response.getheader('Content-Type', '').split(';')[0].strip().lower()
            if mime not in ('text/html', 'text/plain', 'application/xhtml+xml'):
                raise ValueError('La fuente no contiene documentación HTML o texto.')
            raw = response.read(512001)
            if len(raw) > 512000:
                raise ValueError('La página supera el límite de lectura.')
            text = raw.decode('utf-8', errors='replace')
            if mime != 'text/plain':
                parser = DocumentText()
                parser.feed(text)
                text = parser.text()
            if len(text.strip()) < 80:
                raise ValueError('No se pudo extraer contenido suficiente.')
            return {'url': current, 'excerpt': text[:12000], 'truncated': len(text) > 12000}
        finally:
            conn.close()
    raise ValueError('Demasiadas redirecciones.')


def consult_documents(urls):
    sources, failures = [], []
    for url in urls:
        try:
            sources.append(fetch_document(url))
        except (OSError, ValueError, http.client.HTTPException):
            failures.append({'url': url, 'reason': 'No se pudo consultar esta fuente.'})
    return {'status': 'consulted' if sources else 'unavailable', 'sources': sources, 'failures': failures}


def suggested_urls(title, body=''):
    term = title.strip().lower().strip('`')
    defaults = {
        'pip': ['https://pip.pypa.io/en/stable/user_guide/', 'https://pip.pypa.io/en/stable/cli/pip_install/'],
        'venv': ['https://docs.python.org/3/library/venv.html'],
        'requirements.txt': ['https://pip.pypa.io/en/stable/reference/requirements-file-format/',
                             'https://pip.pypa.io/en/stable/cli/pip_freeze/',
                             'https://pip.pypa.io/en/stable/topics/repeatable-installs/'],
    }
    links = re.findall(r'https://[^\s<>\)\]"\x27]+', body)
    candidates = defaults.get(term, []) + links
    result = []
    for url in candidates:
        try:
            clean = validate_urls([url])[0]
            if clean not in result:
                result.append(clean)
        except ValueError:
            pass
        if len(result) == MAX_SOURCES:
            break
    return result
