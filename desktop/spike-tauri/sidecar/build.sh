#!/bin/bash
# Spike F0-01: package the real backend with PyInstaller (onedir) for this OS.
#
# PyInstaller cannot cross-compile: every OS builds on its own runner
# (.github/workflows/desktop-spike.yml). Output: src-tauri/backend/, which
# tauri.conf.json ships as a resource folder (externalBin takes one file only).
# Needs Python 3.12 on PATH (PYTHON overrides it) and runs in Git Bash on Windows.
set -euo pipefail
spike_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_root="$(cd "$spike_dir/../.." && pwd)"
sep=":"
case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
        # Git Bash does not translate /d/a/... inside "src;dest": give Python D:/a/... paths.
        sep=";"
        spike_dir="$(cygpath -m "$spike_dir")" repo_root="$(cygpath -m "$repo_root")"
        ;;
esac
python="${PYTHON:-python}"
build_dir="$spike_dir/.build"
out_dir="$spike_dir/src-tauri/backend"
rm -rf "$build_dir" "$out_dir"
mkdir -p "$build_dir/src"

# Same layout as backend/Dockerfile: backend/ becomes a regular package.
cp -R "$repo_root/backend" "$build_dir/src/"
# benchmark_service imports backend.tests at runtime (the Dockerfile ships tests too).
rm -f "$build_dir/src/backend"/*.db
find "$build_dir/src" -name __pycache__ -prune -exec rm -rf {} +
# migrations/ is a namespace package too: collect-submodules skips those.
touch "$build_dir/src/backend/__init__.py" "$build_dir/src/backend/migrations/__init__.py"

src="$build_dir/src"
json_args=()
for json in "$src"/backend/*.json; do
    json_args+=(--add-data "$json${sep}backend")
done

"$python" -m pip install --quiet -r "$repo_root/backend/requirements.txt" "pyinstaller==6.22.3"
# "python -m" puts the working directory on sys.path: from the repo root the
# un-packaged backend/ (no __init__.py) would shadow the staged copy.
cd "$build_dir"
start=$(date +%s)
# collect_submodules runs in the spec process, which ignores --paths.
PYTHONPATH="$src" "$python" -m PyInstaller --noconfirm --onedir --console --name counselorbot-backend \
    --distpath "$build_dir/dist" --workpath "$build_dir/work" --specpath "$build_dir" \
    --paths "$src" \
    --collect-submodules backend \
    --collect-submodules uvicorn \
    --collect-submodules passlib \
    --collect-all pymupdf --collect-all pymupdf4llm \
    --add-data "$src/backend/prompts${sep}backend/prompts" \
    --add-data "$src/backend/diagram_icons${sep}backend/diagram_icons" \
    --add-data "$repo_root/knowledge${sep}knowledge" \
    --add-data "$repo_root/docs-counselorbot${sep}docs-counselorbot" \
    "${json_args[@]}" \
    "$spike_dir/sidecar/server.py"
echo "pyinstaller_seconds=$(( $(date +%s) - start ))"
mv "$build_dir/dist/counselorbot-backend" "$out_dir"
du -sk "$out_dir" | awk '{printf "onedir_mb=%.1f\n", $1/1024}'
