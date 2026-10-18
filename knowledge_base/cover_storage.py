"""Persistent cover URLs and explicit, non-destructive offline preservation."""
import hashlib
import io
import os
from pathlib import Path
import shutil
import uuid

from PIL import Image


def cover_root(data_dir):
    return Path(data_dir) / 'covers'


def cover_path(data_dir, legacy_root, filename):
    """Prefer the volume; retain read compatibility with untransferred covers."""
    for root in (cover_root(data_dir), Path(legacy_root)):
        root = root.resolve()
        candidate = (root / filename).resolve()
        if not candidate.is_relative_to(root):
            raise ValueError('Ruta de portada no válida')
        if candidate.is_file():
            return candidate
    return cover_root(data_dir).resolve() / filename


def inventory(folder):
    folder = Path(folder)
    if not folder.is_dir() or folder.is_symlink():
        raise ValueError('El directorio de portadas debe existir y no ser un enlace')
    result = {}
    for path in sorted(folder.rglob('*')):
        if path.is_symlink():
            raise ValueError('No se admiten enlaces en las portadas')
        if not path.is_file():
            continue
        content = path.read_bytes()
        try:
            with Image.open(io.BytesIO(content)) as image:
                image.verify()
            valid = True
        except (OSError, ValueError, SyntaxError):
            valid = False
        result[path.relative_to(folder).as_posix()] = dict(
            sha256=hashlib.sha256(content).hexdigest(), bytes=len(content), valid_image=valid)
    return result


def compare(baseline, current):
    """A historical invalid file is exempt only while its exact hash survives."""
    return dict(
        missing=sorted(set(baseline) - set(current)),
        changed=sorted(k for k in baseline.keys() & current.keys()
                       if baseline[k]['sha256'] != current[k]['sha256']),
        new=sorted(set(current) - set(baseline)),
        historical_invalid_unchanged=sorted(k for k in baseline.keys() & current.keys()
            if not baseline[k]['valid_image'] and baseline[k]['sha256'] == current[k]['sha256']),
        new_or_changed_invalid=sorted(k for k, value in current.items()
            if not value['valid_image'] and
            (k not in baseline or value['sha256'] != baseline[k]['sha256'])))


def preserve(source, destination):
    """Offline only: preflight all conflicts, copy atomically, never remove originals."""
    source, destination = Path(source), Path(destination)
    if source.is_symlink():
        raise ValueError('No se admiten enlaces en las portadas')
    source = source.resolve()
    if destination.is_symlink():
        raise ValueError('El destino no puede ser un enlace')
    destination = destination.resolve()
    if source == destination or source.is_relative_to(destination) or destination.is_relative_to(source):
        raise ValueError('Origen y destino deben ser árboles separados')
    before = inventory(source)
    existing = inventory(destination) if destination.exists() else {}
    conflicts = [k for k in before.keys() & existing.keys()
                 if before[k]['sha256'] != existing[k]['sha256']]
    if conflicts:
        raise ValueError('Hay portadas distintas en el destino; no se sobrescribe ninguna')
    destination.mkdir(parents=True, exist_ok=True)
    for relative, expected in before.items():
        if relative in existing:
            continue
        path = destination / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.cover.tmp')
        try:
            shutil.copyfile(source / relative, temp)
            if hashlib.sha256(temp.read_bytes()).hexdigest() != expected['sha256']:
                raise ValueError('El origen cambió durante la copia')
            with temp.open('rb') as file:
                os.fsync(file.fileno())
            os.replace(temp, path)
        finally:
            temp.unlink(missing_ok=True)
    after = inventory(destination)
    if inventory(source) != before or any(after.get(k) != value for k, value in before.items()):
        raise ValueError('Verificación de portadas fallida; conservar ambos árboles y revisar')
    return dict(copied=len(set(before) - set(existing)), total_source=len(before),
                verified=True, files=after)
