import os
from pathlib import Path
import signal
import subprocess
import sys

import pytest


ENTRYPOINT = Path(__file__).resolve().parents[2] / 'deploy' / 'atlas-entrypoint.sh'


@pytest.mark.parametrize('enabled,key,fails', [(False, False, False), (True, False, False), (True, True, False), (True, True, True)])
def test_startup_keeps_web_available_and_secret_private(tmp_path, enabled, key, fails):
    fakebin = tmp_path / 'bin'
    fakebin.mkdir()
    socket = tmp_path / 'tailscale.sock'
    pidfile = tmp_path / 'pid'
    daemon = fakebin / 'tailscaled'
    daemon.write_text(f'''#!{sys.executable}
import os, socket, signal
assert 'TAILSCALE_AUTHKEY' not in os.environ
null=os.open('/dev/null',os.O_WRONLY)
os.dup2(null,1); os.dup2(null,2)
s = socket.socket(socket.AF_UNIX)
s.bind({str(socket)!r})
open({str(pidfile)!r}, 'w').write(str(os.getpid()))
signal.pause()
''')
    cli = fakebin / 'tailscale'
    cli.write_text(f'''#!{sys.executable}
import os, sys
arg=next(a for a in sys.argv if a.startswith('--auth-key=file:'))
name=arg.split('file:',1)[1]
assert open(name).read()=='unit-test-registration-key'
assert os.stat(name).st_mode & 0o777 == 0o600
assert 'TAILSCALE_AUTHKEY' not in os.environ
open({str(tmp_path / 'auth-path')!r},'w').write(name)
print('unit-test-registration-key', file=sys.stderr)
sys.exit({1 if fails else 0})
''')
    daemon.chmod(0o755)
    cli.chmod(0o755)
    env = {**os.environ, 'PATH': str(fakebin) + os.pathsep + os.environ['PATH'],
           'ATLAS_TAILSCALE_ENABLED': '1' if enabled else '0',
           'ATLAS_TAILSCALE_STATE_DIR': str(tmp_path / 'state'),
           'ATLAS_TAILSCALE_SOCKET': str(socket)}
    env.pop('TAILSCALE_AUTHKEY', None)
    env.pop('KOBOLDCPP_HTTP_PROXY', None)
    if key:
        env['TAILSCALE_AUTHKEY'] = 'unit-test-registration-key'
    try:
        result = subprocess.run(['sh', str(ENTRYPOINT), sys.executable, '-c',
                                 'import os; assert "TAILSCALE_AUTHKEY" not in os.environ; print("web-started", os.environ.get("KOBOLDCPP_HTTP_PROXY", "direct"))'],
                                env=env, text=True, capture_output=True, timeout=15)
        assert result.returncode == 0
        assert 'web-started' in result.stdout
        assert 'unit-test-registration-key' not in result.stdout + result.stderr
        assert ('http://127.0.0.1:1056' in result.stdout) == enabled
        if enabled and key:
            authpath = Path((tmp_path / 'auth-path').read_text())
            assert not authpath.exists()
            assert ('enlace Tailscale activo' in result.stderr) != fails
    finally:
        if pidfile.exists():
            try:
                os.kill(int(pidfile.read_text()), signal.SIGTERM)
            except ProcessLookupError:
                pass
