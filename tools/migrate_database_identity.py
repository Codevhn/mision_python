#!/usr/bin/env python3
"""Offline database identity migration; preview is read-only by default."""
import argparse
import json
import sqlite3
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "knowledge_base"))
from database_identity import inventory, prepare, apply

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--root", type=Path, help="DATA_ROOT containing data/ and knowledge/")
parser.add_argument("--backup", type=Path, help="New backup directory outside repository and DATA_ROOT")
parser.add_argument("--assignments", type=Path, help="JSON mapping entry IDs to reviewed database IDs")
parser.add_argument("--resume", type=Path, help="Existing migration.json; preserve generated identities")
parser.add_argument("--apply", action="store_true")
parser.add_argument("--offline", action="store_true", help="Confirm Atlas and all writers are stopped")
args = parser.parse_args()
try:
    if args.apply and not args.offline:
        parser.error("--apply requires --offline: stop Atlas and all writers first")
    if args.resume:
        if not args.apply or args.root or args.assignments:
            parser.error("--resume requires --apply and cannot be combined with --root/--assignments")
        result = apply(args.resume)
    else:
        if not args.root:
            parser.error("--root is required")
        assignments = json.loads(args.assignments.read_text()) if args.assignments else None
        if args.apply:
            if not args.backup:
                parser.error("--apply requires a new --backup directory")
            repo = Path(__file__).resolve().parents[1]
            if args.backup.resolve().is_relative_to(repo):
                parser.error("--backup must be outside the repository")
            journal = prepare(args.root, args.backup, assignments)
            print("Journal and backup:", journal)
            result = apply(journal)
        else:
            result = inventory(args.root, assignments)
    print(json.dumps({key: result[key] for key in ("version", "status", "sources", "unresolved")}, ensure_ascii=False, indent=2))
except (ValueError, OSError, KeyError, sqlite3.Error) as exc:
    parser.exit(1, f"Migration stopped: {exc}\n")
