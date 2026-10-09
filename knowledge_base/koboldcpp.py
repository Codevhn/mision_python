"""KoboldCpp's OpenAI-compatible API; address is server configuration only."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request


def base_url():
    value = os.environ.get('KOBOLDCPP_BASE_URL', '').strip().rstrip('/')
    if not value:
        return ''
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('KOBOLDCPP_BASE_URL debe ser una URL HTTP(S) sin credenciales, consulta ni fragmento.')
    # Accept the server root, /v1, or the full chat endpoint.
    if value.endswith('/chat/completions'):
        value = value[:-len('/chat/completions')]
    if not value.endswith('/v1'):
        value += '/v1'
    return value


def output_limit(requested):
    try:
        limit = int(os.environ.get('KOBOLDCPP_MAX_OUTPUT_TOKENS', '1024'))
    except ValueError:
        limit = 1024
    return min(requested, max(128, min(limit, 8192)))


def models():
    url = base_url()
    if not url:
        return [], 'Configura KOBOLDCPP_BASE_URL para conectar el servidor de tu PC.'
    headers = {'Accept': 'application/json'}
    key = os.environ.get('KOBOLDCPP_API_KEY', '')
    if key:
        headers['Authorization'] = 'Bearer ' + key
    try:
        req = urllib.request.Request(url + '/models', headers=headers)
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read(262144))
        found = []
        seen = set()
        for item in data.get('data', []):
            mid = item.get('id')
            if isinstance(mid, str) and mid.strip() and mid not in seen:
                seen.add(mid)
                found.append({'id': mid, 'label': mid, 'hint': 'Local · KoboldCpp · usa el modelo cargado en tu PC'})
        if not found:
            return [], 'KoboldCpp no anunció ningún modelo. Carga un modelo y comprueba /v1/models.'
        return found, None
    except urllib.error.HTTPError as error:
        if error.code in (401, 403):
            return [], 'KoboldCpp rechazó la conexión. Revisa KOBOLDCPP_API_KEY o los permisos del puente privado.'
        return [], f'KoboldCpp respondió HTTP {error.code}. Comprueba que esta versión ofrece /v1/models.'
    except (OSError, ValueError, TypeError, AttributeError):
        return [], 'No se pudo conectar con KoboldCpp. Comprueba que el modelo esté cargado y la conexión privada esté activa. En Fly, localhost apunta a Fly, no a tu PC.'


def connection_error():
    return 'KoboldCpp no respondió. Comprueba el servidor de tu PC y la conexión privada. La petición no se cambió a una API de pago.'
