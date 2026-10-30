#!/usr/bin/env python3
"""Require a reviewed Markdown update when tracked product sources change.

No LLM, network or third-party packages. --base <commit> fails when the diff
against that commit touches product sources without touching the guide.
"""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
GUIDE = 'docs-counselorbot/funzionalita-counselorbot.md'


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


def check_base(root, base):
    changed = git(root, 'diff', '--name-only', '-z', base, '--').decode().split('\0')
    if any(product_source(name) for name in changed if name) and GUIDE not in changed:
        raise ValueError('Le modifiche al prodotto devono includere un aggiornamento di ' + GUIDE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True, help='Commit di confronto (es. origin/main)')
    args = parser.parse_args()
    try:
        check_base(ROOT, args.base)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print('Funzionalità CounselorBot: documentazione allineata.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
