"""Persistent database sources and offline, resumable identity migration.

No Flask import: inspecting/migrating a copy must not bootstrap the live index.
"""
import hashlib
from contextlib import closing
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import uuid

VERSION = 1
ID_RE = re.compile(r"db_[0-9a-f]{32}\Z")


def valid_id(value):
    return isinstance(value, str) and bool(ID_RE.fullmatch(value))


def database_blocks(markdown):
    """Yield JSON spans only outside fenced code; leave unrelated bytes intact."""
    lines = markdown.splitlines(keepends=True)
    offset, fence, i = 0, None, 0
    while i < len(lines):
        line = lines[i]
        stripped = line.lstrip()
        marker = re.match(r"(`{3,}|~{3,})", stripped)
        if marker:
            token = marker.group()
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
        if fence is None and stripped.rstrip() == ":::database":
            start = offset + len(line)
            end, j = start, i + 1
            while j < len(lines) and lines[j].strip() != ":::":
                end += len(lines[j])
                j += 1
            if j == len(lines):
                raise ValueError("Bloque database sin cierre")
            schema = json.loads(markdown[start:end])
            if not isinstance(schema, dict):
                raise ValueError("El esquema de database debe ser un objeto")
            yield start, end, schema
            offset = end + len(lines[j])
            i = j + 1
        else:
            offset += len(line)
            i += 1


def fresh_copy(markdown):
    for start, end, schema in reversed(list(database_blocks(markdown))):
        schema.update(database_id="db_" + uuid.uuid4().hex, identity_version=VERSION)
        markdown = markdown[:start] + json.dumps(schema, ensure_ascii=False) + "\n" + markdown[end:]
    return markdown


def entry_path(root, entry_id, meta):
    kind = meta.get("type")
    if kind == "page":
        parts = ["pages"]
    elif kind == "course":
        parts = ["courses", meta["course"], meta["module"]]
    elif kind == "teamspace":
        parts = ["teamspace", meta.get("teamspace", "general")]
    else:
        parts = [meta["category"], meta["topic"]]
    path = root / "knowledge" / Path(*parts) / (entry_id + ".md")
    if not path.resolve().is_relative_to((root / "knowledge").resolve()):
        raise ValueError("Ruta de entrada fuera del almacén")
    return path


def read_index(root):
    db = root / "data/index.db"
    if db.exists():
        with closing(sqlite3.connect(f"file:{db}?mode=ro", uri=True)) as conn:
            return dict(conn.execute("SELECT entry_id, meta FROM entries")), "sqlite"
    legacy = root / "data/index.json"
    return {key: json.dumps(value, ensure_ascii=False) for key, value in json.loads(legacy.read_text()).items()}, "json"


def digest(value):
    return hashlib.sha256(value).hexdigest()


def inventory(root, assignments=None):
    root = Path(root).resolve()
    raw_index, store = read_index(root)
    index = {key: json.loads(raw) for key, raw in raw_index.items()}
    files, edits, sources, unresolved, memberships = [], [], {}, [], {}
    ownership = {}
    newly_identified = set()
    for key, meta in index.items():
        path = entry_path(root, key, meta)
        if not path.exists():
            raise ValueError(f"Falta Markdown: {key}")
        before = path.read_bytes()
        text = before.decode("utf-8")
        blocks = list(database_blocks(text))
        ids = []
        for _, _, schema in blocks:
            source = schema.get("database_id")
            if source is not None:
                if not valid_id(source) or source in ownership:
                    raise ValueError(f"Identidad inválida o repetida: {source} ({key})")
            else:
                source = "db_" + uuid.uuid4().hex
                newly_identified.add(source)
            if schema.get("identity_version", VERSION) != VERSION:
                raise ValueError("Versión de identidad no compatible")
            ownership[source] = key
            ids.append(source)
        sources[key] = ids
        after = text
        for (start, end, schema), source in reversed(list(zip(blocks, ids))):
            if not schema.get("database_id"):
                schema.update(database_id=source, identity_version=VERSION)
                after = after[:start] + json.dumps(schema, ensure_ascii=False) + "\n" + after[end:]
        files.append({"path": str(path.relative_to(root)), "before_hash": digest(before),
                      "after_hash": digest(after.encode("utf-8"))})
        if after != text:
            edits.append({"path": str(path.relative_to(root)), "before": text, "after": after})
    assignments = assignments or {}
    if not isinstance(assignments, dict):
        raise ValueError("El mapa de asignaciones debe ser un objeto JSON")
    for key, meta in index.items():
        parent = meta.get("parent_id")
        ids = sources.get(parent, [])
        existing = meta.get("database_id")
        target = assignments.get(key)
        if key in assignments and target is None:
            if existing or meta.get("type") != "page":
                raise ValueError(f"Resolución de subpágina no válida para {key}")
            after = dict(meta, db_row=False)
            if after != meta:
                memberships[key] = {"before": raw_index[key], "after": json.dumps(after, ensure_ascii=False)}
            continue
        if key in assignments:
            if existing or not valid_id(target) or target not in ids or meta.get("type") != "page":
                raise ValueError(f"Asignación no válida para {key}")
        elif not existing and meta.get("type") == "page" and meta.get("db_row") is True and len(ids) == 1 and ids[0] in newly_identified:
            target = ids[0]
        if target:
            after = dict(meta, database_id=target, db_row=True)
            memberships[key] = {"before": raw_index[key], "after": json.dumps(after, ensure_ascii=False)}
        elif existing:
            if existing not in ids or not valid_id(existing):
                unresolved.append({"entry_id": key, "parent_id": parent, "reason": "orphan_identity", "database_id": existing})
        elif meta.get("db_row") is True or (meta.get("db_row", meta.get("type") == "page") and parent):
            unresolved.append({"entry_id": key, "parent_id": parent, "reason": "missing_container" if not parent else "ambiguous_sources" if len(ids) > 1 else "unconfirmed_legacy_row", "candidates": ids})
    unknown = set(assignments) - set(index)
    if unknown:
        raise ValueError(f"Entradas desconocidas en asignación: {sorted(unknown)}")
    return {"version": VERSION, "root": str(root), "store": store,
            "index_before": raw_index, "files": files, "edits": edits,
            "memberships": memberships, "sources": sources, "unresolved": unresolved,
            "status": "planned"}


def write_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8") as out:
        json.dump(value, out, ensure_ascii=False, indent=2)
        out.flush()
        os.fsync(out.fileno())
    os.replace(temporary, path)


def prepare(root, backup_dir, assignments=None):
    root, backup = Path(root).resolve(), Path(backup_dir).resolve()
    if backup.is_relative_to(root) or root.is_relative_to(backup):
        raise ValueError("La copia debe estar fuera del árbol de datos y del repositorio")
    plan = inventory(root, assignments)
    backup.mkdir(parents=True, exist_ok=False)
    for name in ("data", "knowledge"):
        def ignore_index(directory, names):
            if Path(directory) == root / "data" and plan["store"] == "sqlite":
                return {"index.db", "index.db-wal", "index.db-shm"} & set(names)
            return set()
        shutil.copytree(root / name, backup / name, ignore=ignore_index)
    if plan["store"] == "sqlite":
        # Build a NEW standalone DB. Never open a raw copy with copied WAL/SHM.
        with closing(sqlite3.connect(f"file:{root / 'data/index.db'}?mode=ro", uri=True)) as src:
            with closing(sqlite3.connect(backup / "data/index.db")) as dst:
                src.backup(dst)
                dst.execute("PRAGMA journal_mode=DELETE")
    copied, _ = read_index(backup)
    if copied != plan["index_before"]:
        raise ValueError("El índice cambió durante la copia; detener Atlas y repetir")
    for item in plan["files"]:
        if digest((backup / item["path"]).read_bytes()) != item["before_hash"]:
            raise ValueError("Markdown cambió durante la copia; detener Atlas y repetir")
    plan["backup_manifest"] = {
        str(path.relative_to(backup)): digest(path.read_bytes())
        for path in sorted(backup.rglob("*")) if path.is_file()
    }
    write_json(backup / "migration.json", plan)
    return backup / "migration.json"


def apply(plan_path):
    """Offline roll-forward: every input must equal its recorded before OR after.

    A crash between Markdown and SQLite is safe to resume with the same journal.
    No data is removed, and no unrelated metadata is rewritten.
    """
    plan_path = Path(plan_path)
    plan = json.loads(plan_path.read_text())
    if plan["version"] != VERSION:
        raise ValueError("Versión de migración no compatible")
    for relative, expected_hash in plan["backup_manifest"].items():
        path = plan_path.parent / relative
        if not path.is_file() or digest(path.read_bytes()) != expected_hash:
            raise ValueError(f"Respaldo incompleto o alterado: {relative}")
    root = Path(plan["root"])
    current, store = read_index(root)
    expected = plan["index_before"]
    if set(current) != set(expected):
        raise ValueError("El conjunto de entradas cambió; no se aplica el plan")
    for key, before in expected.items():
        after = plan["memberships"].get(key, {}).get("after", before)
        if current[key] not in (before, after):
            raise ValueError(f"Metadatos cambiaron: {key}")
    for item in plan["files"]:
        if digest((root / item["path"]).read_bytes()) not in (item["before_hash"], item["after_hash"]):
            raise ValueError(f"Markdown cambió: {item['path']}")
    # Journal must land before the first source write.
    plan["status"] = "applying"
    write_json(plan_path, plan)
    for item in plan["edits"]:
        path = root / item["path"]
        temporary = path.with_name(path.name + ".identity.tmp")
        with temporary.open("wb") as out:
            out.write(item["after"].encode("utf-8"))
            out.flush()
            os.fsync(out.fileno())
        shutil.copystat(path, temporary)
        os.replace(temporary, path)
    if store == "json":
        result = {key: json.loads(plan["memberships"].get(key, {}).get("after", raw)) for key, raw in current.items()}
        write_json(root / "data/index.json", result)
    else:
        with closing(sqlite3.connect(root / "data/index.db")) as conn:
            with conn:
                conn.execute("BEGIN IMMEDIATE")
                for key, change in plan["memberships"].items():
                    cursor = conn.execute("UPDATE entries SET meta=? WHERE entry_id=? AND meta IN (?, ?)",
                                          (change["after"], key, change["before"], change["after"]))
                    if cursor.rowcount != 1:
                        raise ValueError(f"Conflicto de migración: {key}")
    plan["status"] = "complete"
    write_json(plan_path, plan)
    return plan
