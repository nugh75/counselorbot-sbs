#!/bin/bash
# cloudflared per l'app docente (F1-02): scarica la release ufficiale per la
# piattaforma, ne verifica lo SHA-256 e la mette in <cartella>/cloudflared[.exe].
#
# Uso: fetch-cloudflared.sh <macos-arm64|macos-x64|windows-x64|linux-x64> <cartella>
# Versione fissata e piu' vecchia di due settimane al momento della scelta;
# gli SHA-256 sono quelli pubblicati da GitHub per gli asset della release.
set -euo pipefail

VERSION=2026.10.0
BASE="https://github.com/cloudflare/cloudflared/releases/download/${VERSION}"

if [ $# -ne 2 ]; then
    echo "uso: $0 <macos-arm64|macos-x64|windows-x64|linux-x64> <cartella>" >&2
    exit 2
fi
platform=$1
dest=$2
case "$platform" in
    macos-arm64) asset=cloudflared-darwin-arm64.tgz sha=a2f79ff7b9420aa537d74af239f376da170bbabeb529aec416002adac6a72e70 ;;
    macos-x64) asset=cloudflared-darwin-amd64.tgz sha=903845b81828c8cb3c5d13d816a2de71c06a3da5785469df8eb0e1b736d92f9f ;;
    linux-x64) asset=cloudflared-linux-amd64 sha=d33ff2d14475178d2012c2c56beba87389ac5ded27649519f198a7d3134a99db ;;
    windows-x64) asset=cloudflared-windows-amd64.exe sha=86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c ;;
    *) echo "piattaforma sconosciuta: $platform" >&2; exit 2 ;;
esac

sha256() {
    if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fsSL --retry 3 -o "$work/$asset" "$BASE/$asset"
actual=$(sha256 "$work/$asset")
if [ "$actual" != "$sha" ]; then
    echo "SHA-256 non corrispondente per $asset: $actual" >&2
    exit 1
fi
rm -rf "$dest"
mkdir -p "$dest"
case "$asset" in
    *.tgz) tar -xzf "$work/$asset" -C "$dest" ;;
    *.exe) cp "$work/$asset" "$dest/cloudflared.exe" ;;
    *) cp "$work/$asset" "$dest/cloudflared" ;;
esac
[ -f "$dest/cloudflared" ] && chmod +x "$dest/cloudflared"
echo "cloudflared $VERSION ($platform) in $dest"
