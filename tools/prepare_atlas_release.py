#!/usr/bin/env python3
"""Build a clean, hashed runtime context from current tracked AND untracked code."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


def prepare(repo, output):
    repo, output = Path(repo).resolve(), Path(output).resolve()
    if output.is_relative_to(repo):
        raise ValueError('El contexto debe quedar fuera del repositorio')
    paths = set()
    for args in (['ls-files', '-z'], ['ls-files', '--others', '--exclude-standard', '-z']):
        paths.update(subprocess.check_output(['git', *args], cwd=repo).decode().split('\0'))
    fixed = {'Dockerfile', '.dockerignore', 'deploy/atlas-entrypoint.sh',
             'tools/migrate_database_identity.py', 'tools/preserve_atlas_covers.py'}
    runtime = set(fixed)
    for name in paths - {''}:
        path = Path(name)
        if path.parts[0] != 'knowledge_base':
            continue
        if len(path.parts) == 2 and (path.suffix == '.py' or path.name == 'requirements.txt'):
            runtime.add(name)
        elif len(path.parts) > 2 and path.parts[1] in ('static', 'templates'):
            if path.parts[2] not in ('covers', '__pycache__') and path.suffix not in ('.pyc', '.log', '.db'):
                runtime.add(name)
    manifest = []
    for name in sorted(runtime):
        path = repo / name
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(repo):
            raise ValueError('Archivo de código ausente o enlace: ' + name)
        content = path.read_bytes()
        manifest.append(dict(path=name, bytes=len(content), sha256=hashlib.sha256(content).hexdigest()))
    encoded = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
    digest = hashlib.sha256(encoded).hexdigest()
    output.mkdir(parents=True, exist_ok=False)
    context = output / 'context'; context.mkdir()
    for item in manifest:
        target = context / item['path']; target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(repo / item['path'], target)
        if hashlib.sha256(target.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('El código cambió durante la preparación')
    (output / 'source-manifest.json').write_bytes(encoded)
    (output / 'source-manifest.sha256').write_text(digest + '\n')
    metadata = dict(source_manifest_sha256=digest, files=len(manifest),
                    git_head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo).decode().strip(),
                    branch=subprocess.check_output(['git', 'branch', '--show-current'], cwd=repo).decode().strip(),
                    includes_local_changes=True, context=str(context))
    (output / 'source.json').write_text(json.dumps(metadata, indent=2))
    return metadata


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(Path(__file__).resolve().parents[1], args.output), indent=2))
