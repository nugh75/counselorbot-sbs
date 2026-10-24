#!/usr/bin/env bash
# Graphviz per le app desktop (F1-04, docs/architecture/desktop-native-deps.md).
#
# Uso: fetch-graphviz.sh <windows-x64|macos-arm64|macos-x64|linux-x64> <cartella>
#
# Solo Windows ha un binario ufficiale autosufficiente: lo scarica, ne verifica
# lo SHA-256 e mette in <cartella>/bin i programmi e le DLL (il guscio passa quella
# cartella al backend in NATIVE_BIN_DIR) e in <cartella>/LICENSES la licenza.
# Sulle altre piattaforme non scarica nulla: il backend usa il Graphviz di sistema
# se c'e' (Homebrew, apt) e altrimenti mostra i diagrammi come testo.
# Funziona anche in Git Bash sui runner Windows.
set -euo pipefail

VERSION=16.1.0
WIN_ZIP_URL="https://gitlab.com/api/v4/projects/4207231/packages/generic/graphviz-releases/${VERSION}/windows_10_cmake_Release_Graphviz-${VERSION}-win64.zip"
WIN_ZIP_SHA256=733e49626c492242eb8dca30ea627b6ead20710e207998c7933b4909d92d6abc
LICENSE_URL="https://gitlab.com/graphviz/graphviz/-/raw/${VERSION}/LICENSE"
LICENSE_SHA256=0becf16567beb77fa252b7664631dd177c8f9a1889e48995b45379c7130e5303

if [ $# -ne 2 ]; then
  echo "uso: $0 <windows-x64|macos-arm64|macos-x64|linux-x64> <cartella>" >&2
  exit 2
fi
platform=$1
dest=$2

case "$platform" in
  windows-x64) ;;
  macos-arm64|macos-x64|linux-x64)
    echo "graphviz: nessun binario incluso per $platform (si usa quello di sistema, se presente)"
    exit 0
    ;;
  *)
    echo "piattaforma sconosciuta: $platform" >&2
    exit 2
    ;;
esac

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

fetch() {  # url file sha256
  curl -fsSL --retry 3 -o "$2" "$1"
  local actual
  actual=$(sha256 "$2")
  if [ "$actual" != "$3" ]; then
    echo "SHA-256 non corrispondente per $1: $actual" >&2
    exit 1
  fi
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

fetch "$WIN_ZIP_URL" "$work/graphviz.zip" "$WIN_ZIP_SHA256"
fetch "$LICENSE_URL" "$work/LICENSE" "$LICENSE_SHA256"
unzip -q "$work/graphviz.zip" -d "$work/unpacked"

rm -rf "$dest/bin"
mkdir -p "$dest/bin" "$dest/LICENSES"
cp -R "$work/unpacked/Graphviz-${VERSION}-win64/bin/." "$dest/bin/"
cp "$work/LICENSE" "$dest/LICENSES/graphviz-EPL-2.0.txt"
echo "graphviz ${VERSION}: $(du -sh "$dest/bin" | cut -f1) in $dest/bin"
