"""Course order and bounded page-count cache; no saved-content mutations."""
from collections import OrderedDict
from threading import Lock
import hashlib
import json
import re

_counts = OrderedDict()
_lock = Lock()


def preceding_lessons(index, identifier):
    current = index[identifier]
    if current.get('type') != 'course':
        return []
    modules = {}
    for key, meta in index.items():
        if meta.get('type') != 'course' or meta.get('course') != current.get('course') or meta.get('database_deleted'):
            continue
        modules.setdefault(meta.get('module', ''), []).append((key, meta))
    def module_number(items):
        value = str(items[0][1].get('module_number') or '')
        return float(value) if re.fullmatch(r'\d+(?:\.\d+)?', value) else float('inf')
    ordered = []
    # Stable ordering matches the course tree, including legacy unnamed modules.
    for items in sorted(modules.values(), key=module_number):
        ordered.extend(key for key, _ in sorted(items, key=lambda item: (item[1].get('order', 0), '')))
    return ordered[:ordered.index(identifier)] if identifier in ordered else []


def count_key(document, members, options):
    digest = hashlib.sha256(document.encode())
    digest.update(json.dumps(options, sort_keys=True).encode())
    for name, content in sorted(members.items()):
        digest.update(name.encode()); digest.update(hashlib.sha256(content).digest())
    return digest.hexdigest()


def cached_count(key):
    with _lock:
        value = _counts.get(key)
        if value is not None:
            _counts.move_to_end(key)
        return value


def remember_count(key, value):
    with _lock:
        _counts[key] = value
        _counts.move_to_end(key)
        while len(_counts) > 256:
            _counts.popitem(last=False)
