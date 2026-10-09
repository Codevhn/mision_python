#!/usr/bin/env python3
"""Start an isolated Atlas test on loopback, without production data or keys."""
import argparse
import getpass
import os
from pathlib import Path
import secrets
import sys
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--kobold-url', default='http://127.0.0.1:5001/v1')
parser.add_argument('--port', type=int, default=8080)
args = parser.parse_args()
password = getpass.getpass('Contraseña temporal para entrar en Atlas: ')
if not password:
    parser.error('La contraseña no puede estar vacía.')
root = Path(tempfile.mkdtemp(prefix='atlas-koboldcpp-'))
(root / 'data').mkdir()
(root / 'knowledge').mkdir()
# A local test must not accidentally pick up paid provider credentials.
for name in ('DEEPSEEK_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'OMNIROUTE_API_KEY', 'ADMIN_TOKEN'):
    os.environ.pop(name, None)
os.environ.update(DATA_ROOT=str(root), SECRET_KEY=secrets.token_urlsafe(32),
                  KB_PASSWORD=password, SECURE_COOKIES='false', ENABLE_CODE_EXECUTION='false',
                  KOBOLDCPP_BASE_URL=args.kobold_url)
os.environ.setdefault('KOBOLDCPP_MAX_OUTPUT_TOKENS', '1024')
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'knowledge_base'))
import app
print('Datos de prueba separados:', root)
print('Atlas local: http://127.0.0.1:' + str(args.port))
app.app.run(host='127.0.0.1', port=args.port, debug=False)
