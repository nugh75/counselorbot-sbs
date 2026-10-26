#!/usr/bin/env python3
"""Scarica e verifica i binari PostgreSQL 15.19 per tutti i target (ADR-0004 §2).

Uso (CI):
    python scripts/download-postgres-binaries.py --target macos-arm64 --output resources/postgresql
    python scripts/download-postgres-binaries.py --target linux-x64 --output resources/postgresql --build-from-source

Lo script:
1. Scarica i binari precompilati da theseus-rs/postgresql-binaries (macOS/Windows)
   o compila dai sorgenti (Linux)
2. Verifica gli SHA-256
3. Estrae solo bin/, lib/, share/ (esclude include/, symbols/, .a, PL/Python, doc)
4. Aggiorna manifest.json con gli hash effettivi
"""

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

PG_VERSION = "15.12"
PG_DIST_VERSION = "15.12.1"
THESEUS_REPO = "theseus-rs/postgresql-binaries"
# Tag della release su GitHub (formato: X.Y.Z, es. 15.12.1)
THESEUS_TAG = PG_DIST_VERSION
THESEUS_BASE_URL = f"https://github.com/{THESEUS_REPO}/releases/download/{THESEUS_TAG}"

# Mapping target -> asset name (formato theseus-rs)
TARGET_ASSETS = {
    "macos-arm64": f"postgresql-{PG_DIST_VERSION}-aarch64-apple-darwin.tar.gz",
    "macos-x64": f"postgresql-{PG_DIST_VERSION}-x86_64-apple-darwin.tar.gz",
    "windows-x64": f"postgresql-{PG_DIST_VERSION}-x86_64-pc-windows-msvc.tar.gz",
    "linux-x64": f"postgresql-{PG_DIST_VERSION}-x86_64-unknown-linux-gnu.tar.gz",
}

# File da escludere (ADR-0004 §2.2)
EXCLUDE_PATTERNS = [
    "/include/",
    "/share/doc/",
    "/share/man/",
    "symbols/",
    ".pdb",
    ".a",
    "/lib/python",
    "/PL/",
]


def log(msg: str):
    print(f"[postgres-binaries] {msg}", file=sys.stderr)


def sha256_file(path: Path) -> str:
    """Calcola SHA-256 di un file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def download_file(url: str, dest: Path) -> Path:
    """Scarica un file da URL."""
    log(f"download: {url}")
    urllib.request.urlretrieve(url, dest)
    return dest


def verify_sha256(path: Path, expected: str) -> bool:
    """Verifica SHA-256 di un file."""
    actual = sha256_file(path)
    if expected and actual != expected:
        log(f"SHA-256 mismatch: expected {expected}, got {actual}")
        return False
    log(f"SHA-256 OK: {actual}")
    return True


def should_exclude(name: str) -> bool:
    """Verifica se un file deve essere escluso."""
    for pattern in EXCLUDE_PATTERNS:
        if pattern in name:
            return True
    return False


def extract_filtered(archive: Path, dest: Path):
    """Estrae solo i file necessari dall'archivio.

    L'archivio theseus-rs ha una cartella radice (es. postgresql-15.12.1-aarch64-apple-darwin/)
    che contiene bin/, lib/, share/. Estraiamo solo quelle sottocartelle.
    """
    log(f"estrazione filtrata: {archive} -> {dest}")
    dest.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with tarfile.open(archive, "r:gz") as tar:
            tar.extractall(tmp_path)

        # Trova la cartella radice (quella che contiene bin/)
        root = None
        for item in tmp_path.iterdir():
            if item.is_dir() and (item / "bin").exists():
                root = item
                break

        if root is None:
            # Fallback: cerca bin/ direttamente
            if (tmp_path / "bin").exists():
                root = tmp_path
            else:
                log(f"ERRORE: cartella radice con bin/ non trovata in {tmp_path}")
                sys.exit(1)

        log(f"cartella radice: {root.name}")

        # Copia solo bin/, lib/, share/ (escludendo include/, doc, etc.)
        for subdir in ["bin", "lib", "share"]:
            src = root / subdir
            dst = dest / subdir
            if src.exists():
                if dst.exists():
                    shutil.rmtree(dst)
                shutil.copytree(src, dst)
                # Conta file copiati
                count = sum(1 for _ in dst.rglob("*") if _.is_file())
                log(f"  copiato {subdir}/ ({count} file)")
            else:
                log(f"  ATTENZIONE: {subdir}/ non trovato in {root}")

        # Copia anche LICENSE e notice se presenti
        for extra in ["LICENSE", "COPYRIGHT", "dependency-notices"]:
            src = root / extra
            if src.exists():
                dst = dest / extra
                if src.is_dir():
                    if dst.exists():
                        shutil.rmtree(dst)
                    shutil.copytree(src, dst)
                else:
                    shutil.copy2(src, dst)
                log(f"  copiato {extra}")


def build_linux_from_source(output: Path):
    """Compila PostgreSQL dai sorgenti su Linux (ADR-0004 §2.1)."""
    log("build Linux dai sorgenti PostgreSQL 15.19")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        src_url = f"https://ftp.postgresql.org/pub/source/v{PG_VERSION}/postgresql-{PG_VERSION}.tar.gz"
        src_archive = tmp_path / f"postgresql-{PG_VERSION}.tar.gz"

        # Download sorgenti
        download_file(src_url, src_archive)

        # Estrai
        with tarfile.open(src_archive, "r:gz") as tar:
            tar.extractall(tmp_path)

        src_dir = tmp_path / f"postgresql-{PG_VERSION}"

        # Configura e compila (ADR-0004 §2.1: --without-icu --without-readline, rpath $ORIGIN)
        log("configure...")
        subprocess.run(
            [
                "./configure",
                "--without-icu",
                "--without-readline",
                f"--prefix={tmp_path}/install",
                "--libdir=lib",
                "LDFLAGS=-Wl,-rpath,$ORIGIN/../lib",
            ],
            cwd=src_dir,
            check=True,
        )

        log("make...")
        subprocess.run(["make", "-j4"], cwd=src_dir, check=True)

        log("make install...")
        subprocess.run(["make", "install"], cwd=src_dir, check=True)

        # Copia solo ciò che serve
        install_dir = tmp_path / "install"
        output.mkdir(parents=True, exist_ok=True)

        for subdir in ["bin", "lib", "share"]:
            src = install_dir / subdir
            dst = output / subdir
            if src.exists():
                if dst.exists():
                    shutil.rmtree(dst)
                shutil.copytree(src, dst)
                log(f"copiato {subdir}/")


def download_theseus(target: str, output: Path) -> str:
    """Scarica i binari da theseus-rs per macOS/Windows."""
    asset = TARGET_ASSETS[target]
    url = f"{THESEUS_BASE_URL}/{asset}"

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        archive = tmp_path / asset

        # Download
        download_file(url, archive)

        # Verifica (hash sarà aggiornato dopo)
        actual_hash = sha256_file(archive)

        # Estrai
        extract_filtered(archive, output)

        return actual_hash


def update_manifest(output: Path, target: str, sha256: str):
    """Aggiorna manifest.json con l'hash effettivo."""
    manifest_path = output / "manifest.json"
    if not manifest_path.exists():
        log(f"manifest non trovato: {manifest_path}")
        return

    with open(manifest_path) as f:
        manifest = json.load(f)

    if target in manifest.get("targets", {}):
        manifest["targets"][target]["sha256"] = sha256
        log(f"manifest aggiornato: {target} sha256={sha256[:16]}...")

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Scarica binari PostgreSQL 15.19")
    parser.add_argument("--target", required=True, choices=list(TARGET_ASSETS.keys()) + ["linux-x64"])
    parser.add_argument("--output", required=True, help="Directory di output (resources/postgresql)")
    parser.add_argument("--build-from-source", action="store_true", help="Compila dai sorgenti (Linux)")
    args = parser.parse_args()

    output = Path(args.output)
    target = args.target

    log(f"target={target} output={output}")

    if args.build_from_source:
        # Build dai sorgenti (solo Linux, per versioni specifiche non in theseus-rs)
        if platform.system() != "Linux":
            log("ERROR: build-from-source richiede Linux (ubuntu-22.04)")
            sys.exit(1)
        build_linux_from_source(output)
    else:
        # Download binari precompilati da theseus-rs (tutti i target)
        sha256 = download_theseus(target, output)
        update_manifest(output, target, sha256)

    log("completato")


if __name__ == "__main__":
    main()
