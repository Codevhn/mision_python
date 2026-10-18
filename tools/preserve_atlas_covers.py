#!/usr/bin/env python3
"""Inventory/transfer covers explicitly; never run automatically at app startup."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'knowledge_base'))
from cover_storage import compare, inventory, preserve

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--destination', type=Path)
parser.add_argument('--baseline', type=Path)
parser.add_argument('--report', type=Path, required=True, help='Private JSON inventory/report outside source trees')
parser.add_argument('--apply', action='store_true')
parser.add_argument('--offline', action='store_true', help='All cover writers are stopped')
args = parser.parse_args()
if args.report.exists():
    parser.error('--report must name a new file')
if args.apply and (not args.offline or not args.destination):
    parser.error('--apply requires --offline and --destination')
for tree in [args.source, args.destination]:
    if tree and args.report.resolve().is_relative_to(tree.resolve()):
        parser.error('--report must be outside cover source/destination')
try:
    current = inventory(args.source)
    result = dict(files=current)
    if args.baseline:
        result['comparison'] = compare(json.loads(args.baseline.read_text())['files'], current)
        if result['comparison']['missing'] or result['comparison']['new_or_changed_invalid']:
            raise ValueError('Faltan portadas históricas o hay nuevos archivos dañados; revisar antes de aplicar')
    if args.apply:
        result['transfer'] = preserve(args.source, args.destination)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with args.report.open('x') as out:
        args.report.chmod(0o600)
        json.dump(result, out, ensure_ascii=False, indent=2)
    print(json.dumps(dict(source_files=len(current), applied=args.apply,
                         invalid_images=sum(not x['valid_image'] for x in current.values()),
                         verified=result.get('transfer', {}).get('verified', False))))
except (ValueError, OSError, KeyError) as error:
    parser.exit(1, str(error) + '\n')
