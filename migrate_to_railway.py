"""
Script temporal de migración — sube notas locales a Railway.
Uso: python migrate_to_railway.py https://tu-app.up.railway.app

BORRAR después del primer uso.
"""
import sys, json, requests
from pathlib import Path

BASE = Path(__file__).parent / "knowledge_base"
INDEX_FILE = BASE / "data" / "index.json"
KNOWLEDGE_DIR = BASE / "knowledge"

if len(sys.argv) < 2:
    print("Uso: python migrate_to_railway.py https://tu-app.up.railway.app")
    sys.exit(1)

SERVER = sys.argv[1].rstrip("/")
index = json.loads(INDEX_FILE.read_text())

ok = 0
errors = 0

for entry_id, meta in index.items():
    cat   = meta["category"]
    topic = meta["topic"]
    md_file = KNOWLEDGE_DIR / cat / topic / f"{entry_id}.md"

    if not md_file.exists():
        # buscar con acento u otras variantes
        candidates = list(KNOWLEDGE_DIR.rglob(f"{entry_id}.md"))
        if not candidates:
            print(f"  [skip] {entry_id} — archivo no encontrado")
            errors += 1
            continue
        md_file = candidates[0]

    raw = md_file.read_text(encoding="utf-8")

    payload = {
        "category": meta.get("category_label") or meta["category"],
        "topic":    meta.get("topic_label")    or meta["topic"],
        "title":    meta["title"],
        "raw_text": raw,
        "status":   meta.get("status", "pendiente"),
        "starred":  meta.get("starred", False),
        "pinned":   meta.get("pinned", False),
    }

    try:
        r = requests.post(f"{SERVER}/api/entry", json=payload, timeout=30)
        if r.ok:
            print(f"  [ok] {meta['title']}")
            ok += 1
        else:
            print(f"  [err {r.status_code}] {meta['title']}")
            errors += 1
    except Exception as e:
        print(f"  [fail] {meta['title']} — {e}")
        errors += 1

print(f"\nMigración completa: {ok} subidas, {errors} errores")
print("Puedes borrar este archivo ahora.")
