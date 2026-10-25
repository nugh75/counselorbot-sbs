#!/usr/bin/env python3
"""Genera il file manifest di aggiornamento (latest.json o latest-beta.json) per Tauri v2.

Scansiona la cartella degli artefatti per individuare pacchetti (.tar.gz, .zip)
e le rispettive firme Minisign (.sig), assemblando il manifest JSON atteso
da tauri-plugin-updater (ADR-0002, F1-16).
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys


TARGET_MAP = [
    # (regex matching filename, platform target key)
    (re.compile(r".*(?:darwin|macos|apple|arm64|aarch64).*\.tar\.gz$", re.IGNORECASE), "darwin-aarch64"),
    (re.compile(r".*(?:darwin|macos|intel|x86_64|x64).*\.tar\.gz$", re.IGNORECASE), "darwin-x86_64"),
    (re.compile(r".*(?:linux|ubuntu).*(?:appimage|deb)?.*\.tar\.gz$", re.IGNORECASE), "linux-x86_64"),
    (re.compile(r".*(?:windows|win64|x64|nsis).*\.zip$", re.IGNORECASE), "windows-x86_64"),
]


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", help="Versione del rilascio (es. 0.2.0)")
    parser.add_argument("--notes", default="Nuovo aggiornamento disponibile.", help="Note di rilascio")
    parser.add_argument("--channel", choices=["stable", "beta"], default="stable", help="Canale di aggiornamento")
    parser.add_argument("--artifacts-dir", type=Path, default=Path("."), help="Cartella contenente i bundle e i file .sig")
    parser.add_argument("--base-url", help="URL base per il download degli asset su GitHub Releases")
    parser.add_argument("--output", type=Path, help="Percorso del manifest di output (default: latest.json o latest-beta.json)")
    return parser.parse_args(argv)


def detect_version_from_cargo(cargo_path: Path) -> str:
    if not cargo_path.is_file():
        return "0.1.0"
    for line in cargo_path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("version = "):
            return line.split("=")[1].strip().strip('"')
    return "0.1.0"


def find_target_for_file(filename: str) -> str | None:
    # Controlli mirati per architettura / OS
    lower = filename.lower()
    if ("darwin" in lower or "macos" in lower or "apple" in lower) and ("aarch64" in lower or "arm64" in lower):
        return "darwin-aarch64"
    if ("darwin" in lower or "macos" in lower or "apple" in lower) and ("x86_64" in lower or "x64" in lower or "intel" in lower):
        return "darwin-x86_64"
    if "linux" in lower or "ubuntu" in lower or "deb" in lower or "appimage" in lower:
        return "linux-x86_64"
    if "windows" in lower or "win" in lower or "nsis" in lower:
        return "windows-x86_64"

    for pattern, target in TARGET_MAP:
        if pattern.match(filename):
            return target
    return None


def generate_manifest(version: str, notes: str, artifacts_dir: Path, base_url: str) -> dict:
    platforms = {}

    # Scansiona file archivio nella directory
    for path in artifacts_dir.rglob("*"):
        if not path.is_file():
            continue
        name = path.name
        if name.endswith(".sig") or name.endswith(".sha256") or name.endswith(".json"):
            continue
        if not (name.endswith(".tar.gz") or name.endswith(".zip")):
            continue

        target = find_target_for_file(name)
        if not target:
            continue

        # Verifica firma .sig
        sig_path = path.with_name(f"{name}.sig")
        signature = ""
        if sig_path.is_file():
            signature = sig_path.read_text(encoding="utf-8").strip()

        download_url = f"{base_url.rstrip('/')}/{name}"
        platforms[target] = {
            "url": download_url,
            "signature": signature,
        }

    manifest = {
        "version": version,
        "notes": notes,
        "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": platforms,
    }
    return manifest


def main(argv=None):
    args = parse_args(argv)

    version = args.version
    if not version:
        cargo_path = Path("desktop/teacher/src-tauri/Cargo.toml")
        version = detect_version_from_cargo(cargo_path)

    base_url = args.base_url
    if not base_url:
        tag = f"v{version}" if args.channel == "stable" else "beta"
        base_url = f"https://github.com/nugh75/counselorbot-sbs/releases/download/{tag}"

    manifest = generate_manifest(version, args.notes, args.artifacts_dir, base_url)

    output_path = args.output
    if not output_path:
        filename = "latest-beta.json" if args.channel == "beta" else "latest.json"
        output_path = args.artifacts_dir / filename

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Manifest generato con successo: {output_path} ({len(manifest['platforms'])} piattaforme)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
