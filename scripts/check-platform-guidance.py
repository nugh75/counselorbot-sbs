#!/usr/bin/env python3
"""Require a reviewed Markdown update when tracked product sources change.

No LLM, network or third-party packages. --refresh records the reviewed state;
--check (default) is suitable for local validation and CI. --base additionally
checks that a commit/PR includes documentation alongside product changes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
GUIDE = 'docs-counselorbot/funzionalita-counselorbot.md'
MANIFEST = 'docs/operations/platform-guidance-state.json'


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])


def product_source(name):
    path = Path(name)
    if any(part in {'tests', '__pycache__', 'node_modules'} for part in path.parts):
        return False
    if '.test.' in name or path.name.startswith('test_'):
        return False
    return (
        name.startswith('frontend/src/') or name.startswith('backend/')
        or name.startswith('frontend/public/images/')
        or name in {'frontend/package.json', 'frontend/package-lock.json',
                    'frontend/next.config.ts', 'frontend/Dockerfile', 'docker-compose.yml',
                    'scripts/check-platform-guidance.py'}
    )


def snapshot(root):
    names = set(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').decode().split('\0'))
    digest = hashlib.sha256()
    for name in sorted(n for n in names if n and product_source(n)):
        path = root / name
        if path.is_file():
            digest.update(name.encode() + b'\0' + hashlib.sha256(path.read_bytes()).digest())
    return {'version': 1, 'product_sha256': digest.hexdigest(),
            'guide_sha256': hashlib.sha256((root / GUIDE).read_bytes()).hexdigest()}


def validate(current, recorded):
    if current != recorded:
        raise ValueError('Documentazione non allineata: aggiorna ' + GUIDE +
                         ', verifica la Guida interfaccia, poi esegui make guidance-refresh.')


def refresh(current, recorded):
    if (recorded and current['product_sha256'] != recorded['product_sha256']
            and current['guide_sha256'] == recorded['guide_sha256']):
        raise ValueError('Il prodotto è cambiato ma il Markdown no. Aggiorna le funzionalità prima di registrare lo stato.')
    return current


def check_base(root, base):
    changed = git(root, 'diff', '--name-only', '-z', base, '--').decode().split('\0')
    if any(product_source(name) for name in changed if name) and GUIDE not in changed:
        raise ValueError('Le modifiche al prodotto devono includere un aggiornamento di ' + GUIDE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--refresh', action='store_true')
    parser.add_argument('--base', help='Commit di confronto per il controllo CI/PR')
    args = parser.parse_args()
    try:
        current = snapshot(ROOT)
        path = ROOT / MANIFEST
        recorded = json.loads(path.read_text()) if path.exists() else None
        if args.refresh:
            path.write_text(json.dumps(refresh(current, recorded), indent=2) + '\n')
        else:
            validate(current, recorded)
        if args.base:
            check_base(ROOT, args.base)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print('Funzionalità CounselorBot: documentazione allineata.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
