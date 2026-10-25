#!/usr/bin/env python3
"""Propagate the single version in VERSION to every place that carries it.

No third-party packages. Default writes the targets; --check exits 1 when any
target is out of sync (used by CI). Targets: frontend/package.json and its
lock, backend/version.py and, when the files exist, desktop/*/package.json,
desktop/*/package-lock.json and desktop/*/src-tauri/tauri.conf.json, the
[package] version of desktop/*/src-tauri/Cargo.toml and the matching crate
entry of desktop/*/src-tauri/Cargo.lock. Dependency versions are never
touched.
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
    for pattern in ('desktop/*/package.json', 'desktop/*/package-lock.json'):
        names += sorted(str(p.relative_to(root)) for p in root.glob(pattern))
    names += sorted(str(p.relative_to(root)) for p in root.glob('desktop/*/src-tauri/tauri.conf.json'))
    return [n for n in names if (root / n).is_file()]


def cargo_targets(root):
    return sorted(str(p.relative_to(root)) for p in root.glob('desktop/*/src-tauri/Cargo.toml'))


def cargo_lock_targets(root):
    return sorted(str(p.relative_to(root)) for p in root.glob('desktop/*/src-tauri/Cargo.lock'))


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


def _line_ending(line):
    if line.endswith('\r\n'):
        return '\r\n'
    if line.endswith('\n'):
        return '\n'
    return ''


def updated_cargo_manifest(text, version):
    """Solo `version` del blocco [package]: dipendenze e tabelle restano intatte."""
    lines = text.splitlines(keepends=True)
    inside = False
    for index, source in enumerate(lines):
        stripped = source.strip()
        if stripped.startswith('[') and stripped.endswith(']'):
            if inside:
                break
            inside = stripped == '[package]'
            continue
        if inside and re.fullmatch(r'version\s*=\s*"[^"]*"', stripped):
            lines[index] = f'version = "{version}"' + _line_ending(source)
            return ''.join(lines)
    raise ValueError('Cargo.toml: campo `version` mancante nel blocco [package]')


def cargo_package_crate(manifest):
    """Crate dell'app: il campo `name` del blocco [package] (non dell'app)."""
    inside = False
    for source in manifest.splitlines():
        stripped = source.strip()
        if stripped.startswith('[') and stripped.endswith(']'):
            if inside:
                break
            inside = stripped == '[package]'
            continue
        if inside:
            match = re.match(r'name\s*=\s*"([^"]*)"$', stripped)
            if match:
                return match.group(1)
    raise ValueError('Cargo.toml: campo `name` mancante nel blocco [package]')


def updated_cargo_lock(text, crate, version):
    """Solo la voce [[package]] del crate dell'app: le voci esterne restano."""
    pattern = re.compile(
        rf'\[\[package\]\]\nname = "{re.escape(crate)}"\nversion = "[^"]*"\n')
    if not pattern.search(text):
        raise ValueError(f'Cargo.lock: voce del crate {crate!r} mancante')
    return pattern.sub(
        lambda _m: f'[[package]]\nname = "{crate}"\nversion = "{version}"\n', text, count=1)


def sync(root, write):
    version = read_version(root)
    changes = [(n, updated_json) for n in json_targets(root)] + [(BACKEND, updated_backend)]
    for name in cargo_targets(root):
        changes.append((name, lambda text, v=version: updated_cargo_manifest(text, v)))
    for name in cargo_lock_targets(root):
        manifest = (root / name).with_name('Cargo.toml')
        if not manifest.is_file():
            raise ValueError(f'{name}: Cargo.toml di accompagnamento mancante')
        crate = cargo_package_crate(manifest.read_text())
        changes.append((name, lambda text, v=version, c=crate: updated_cargo_lock(text, c, v)))
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
