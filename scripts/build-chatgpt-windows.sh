#!/bin/bash
# Standalone Windows helper (#133): no Python or terminal is needed by its users.
#
# Build path: run on Windows (Git Bash) with Python 3.10+ on PATH, e.g. the
# GitHub Actions workflow .github/workflows/chatgpt-windows-helper.yml on a
# windows-latest runner. PyInstaller cannot cross-compile, so the Linux/macOS
# hosts download that workflow's artifact into dist/chatgpt-windows instead.
# The helper ships unsigned (decision 2026-10-09, signing tracked in #135):
# no signing step and no certificate handling here.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="$repo_root/dist/chatgpt-windows"
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/counselorbot-chatgpt-windows.XXXXXX")"
trap 'rm -rf "$build_dir"' EXIT
python="${PYTHON:-python}"
"$python" -m pip install --quiet "pyinstaller==6.11.1"
# Same script as the Python CLI: one behaviour, packaged with its interpreter.
"$python" -m PyInstaller --onefile --console --name CounselorBot-ChatGPT \
    --distpath "$build_dir/dist" --workpath "$build_dir/work" --specpath "$build_dir" \
    "$repo_root/scripts/chatgpt-connect.py"
mkdir -p "$out_dir"
zip_path="$out_dir/CounselorBot-ChatGPT-Windows.zip"
rm -f "$zip_path" "$zip_path.sha256"
"$python" - "$build_dir/dist/CounselorBot-ChatGPT.exe" "$zip_path" <<'PY'
import hashlib, sys, zipfile
exe, archive = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
    bundle.write(exe, "CounselorBot-ChatGPT.exe")
# Published hash for school allow-lists (Defender, AppLocker/WDAC).
digest = hashlib.sha256(open(archive, "rb").read()).hexdigest()
# Unix newline even on Windows, so `sha256sum -c` / `shasum -c` read the name.
open(archive + ".sha256", "w", newline="\n").write(f"{digest}  CounselorBot-ChatGPT-Windows.zip\n")
print(digest)
PY
echo "Built $zip_path"
