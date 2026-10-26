#!/bin/bash
# Esegue un binario Windows con il token ristretto di un utente normale.
# I runner GitHub elevati altrimenti non possono avviare postgres direttamente.
# runas non attende le app GUI: PowerShell attende il processo reale e ne
# restituisce l'exit code, così smoke e lifecycle leggono report aggiornati.
set -euo pipefail

[ "$#" -ge 1 ] || { echo "Uso: $0 <eseguibile> [argomenti...]" >&2; exit 2; }
exe=$(cygpath -m "$1")
shift

ps_literal() {
    local value=${1//\'/\'\'}
    printf "'%s'" "$value"
}

arguments=""
for argument in "$@"; do
    arguments+=" \"$argument\""
done
ps_command="\$process = Start-Process -FilePath $(ps_literal "$exe") -ArgumentList $(ps_literal "$arguments") -Wait -PassThru
exit \$process.ExitCode"
encoded_command=$(PS_COMMAND="$ps_command" python -c 'import base64, os; print(base64.b64encode(os.environ["PS_COMMAND"].encode("utf-16le")).decode())')

MSYS2_ARG_CONV_EXCL='*' /c/Windows/System32/runas.exe /trustlevel:0x20000 \
    "powershell -NoProfile -EncodedCommand $encoded_command"
