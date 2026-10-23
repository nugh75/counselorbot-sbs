#!/usr/bin/env python3
"""Propagate the single version in VERSION to every place that carries it.

No third-party packages. Default writes the targets; --check exits 1 when any
target is out of sync (used by CI). Targets: frontend package.json and lock,
backend/version.py and, when present, desktop/*/package.json and
desktop/*/src-tauri/tauri.conf.json.
"""
import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r'^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')
BACKEND = 'backend/version.py'
BACKEND_LINE = re.compile(r'^__version__ = "[^"]*"$', re.M)


def read_version(root):
    version = (root / 'VERSION').read_text().strip()
    if not SEMVER.match(version):
        raise ValueError(f'VERSION non valida: {version!r} (atteso X.Y.Z)')
    return version


def json_targets(root):
    names = ['frontend/package.json', 'frontend/package-lock.json']
    names += sorted(str(p.relative_to(root)) for p in root.glob('desktop/*/package.json'))
    names += sorted(str(p.relative_to(root)) for p in root.glob('desktop/*/src-tauri/tauri.conf.json'))
    return [n for n in names if (root / n).is_file()]


def updated_json(text, version):
    data = json.loads(text)
    data['version'] = version
    root_package = data.get('packages', {}).get('')
    if root_package is not None:
        root_package['version'] = version
    return json.dumps(data, indent=2, ensure_ascii=False) + '\n'


def updated_backend(text, version):
    if not BACKEND_LINE.search(text):
        raise ValueError(f'{BACKEND}: riga __version__ mancante')
    return BACKEND_LINE.sub(f'__version__ = "{version}"', text, count=1)


def sync(root, write):
    version = read_version(root)
    changes = [(n, updated_json) for n in json_targets(root)] + [(BACKEND, updated_backend)]
    stale = []
    for name, update in changes:
        path = root / name
        text = path.read_text()
        new = update(text, version)
        if new != text:
            stale.append(name)
            if write:
                path.write_text(new)
    return version, stale


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='non scrivere, fallisce se disallineato')
    args = parser.parse_args(argv)
    try:
        version, stale = sync(ROOT, write=not args.check)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    if args.check and stale:
        print(f'Versione {version} non propagata in: ' + ', '.join(stale) +
              '. Esegui python3 scripts/sync-version.py', file=sys.stderr)
        return 1
    print(f'Versione {version}: ' + ('aggiornati ' + ', '.join(stale) if stale and not args.check else 'tutto allineato'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
