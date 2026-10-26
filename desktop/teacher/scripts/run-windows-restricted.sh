#!/bin/bash
# Esegue un binario Windows con il token ristretto di un utente normale.
# I runner GitHub elevati altrimenti non possono avviare postgres direttamente.
# runas ritorna subito: PowerShell attende il processo reale e registra il suo
# exit code in un file, che il chiamante attende prima di leggere i report.
set -euo pipefail

[ "$#" -ge 1 ] || { echo "Uso: $0 <eseguibile> [argomenti...]" >&2; exit 2; }
exe=$(cygpath -m "$1")
shift
result_file=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/run-windows-restricted.XXXXXX")
result_path=$(cygpath -m "$result_file")
trap 'rm -f "$result_file"' EXIT

ps_literal() {
    local value=${1//\'/\'\'}
    printf "'%s'" "$value"
}

arguments=""
for argument in "$@"; do
    arguments+=" \"$argument\""
done
ps_command="\$exitCode = 1
try {
    \$process = Start-Process -FilePath $(ps_literal "$exe") -ArgumentList $(ps_literal "$arguments") -Wait -PassThru
    \$exitCode = \$process.ExitCode
} finally {
    [System.IO.File]::WriteAllText($(ps_literal "$result_path"), [string]\$exitCode)
}
exit \$exitCode"
encoded_command=$(PS_COMMAND="$ps_command" python -c 'import base64, os; print(base64.b64encode(os.environ["PS_COMMAND"].encode("utf-16le")).decode())')

set +e
MSYS2_ARG_CONV_EXCL='*' /c/Windows/System32/runas.exe /trustlevel:0x20000 \
    "powershell -NoProfile -EncodedCommand $encoded_command"
runas_status=$?
set -e
[ "$runas_status" = 0 ] || exit "$runas_status"

for ((attempt = 0; attempt < 3000; attempt++)); do
    if [ -s "$result_file" ]; then
        exit_code=$(cat "$result_file")
        case "$exit_code" in
            ''|*[!0-9]*) echo "Exit code non valido dal processo ristretto" >&2; exit 1 ;;
        esac
        exit "$exit_code"
    fi
    sleep 0.2
done

echo "Timeout in attesa del processo Windows ristretto" >&2
exit 124
