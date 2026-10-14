import os
from pathlib import Path
import subprocess
import sys


SCRIPT = Path(__file__).resolve().parents[2] / 'tools' / 'connect_kobold_fly.sh'


def test_setup_stages_secret_on_stdin_without_printing_it(tmp_path):
    fly = tmp_path / 'fly'
    fly.write_text(f'''#!{sys.executable}
import sys
assert sys.argv[1:]==['secrets','import','--stage','-a','mision-pythonhn']
values=dict(line.rstrip().split('=',1) for line in sys.stdin)
assert values['TAILSCALE_AUTHKEY']=='registration-test-key'
assert values['KOBOLDCPP_BASE_URL']=='http://100.64.0.9:5001/v1'
assert values['ATLAS_TAILSCALE_ENABLED']=='1'
print('staged')
''')
    fly.chmod(0o755)
    result = subprocess.run(['bash', str(SCRIPT)], input='100.64.0.9\n\nregistration-test-key\n',
                            env={**os.environ, 'PATH': str(tmp_path) + os.pathsep + os.environ['PATH']},
                            text=True, capture_output=True, timeout=10)
    assert result.returncode == 0
    assert 'staged' in result.stdout
    assert 'registration-test-key' not in result.stdout + result.stderr


def test_setup_rejects_non_tailscale_address_before_asking_for_key(tmp_path):
    fly = tmp_path / 'fly'
    fly.write_text('#!/bin/sh\nexit 99\n')
    fly.chmod(0o755)
    result = subprocess.run(['bash', str(SCRIPT)], input='8.8.8.8\n',
                            env={**os.environ, 'PATH': str(tmp_path) + os.pathsep + os.environ['PATH']},
                            text=True, capture_output=True, timeout=10)
    assert result.returncode == 1
    assert 'IPv4 privada' in result.stderr
