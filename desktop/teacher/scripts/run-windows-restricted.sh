#!/bin/bash
# Esegue un binario Windows con il token ristretto di un utente normale.
# I runner GitHub elevati altrimenti non possono avviare postgres direttamente.
set -euo pipefail

[ "$#" -ge 1 ] || { echo "Uso: $0 <eseguibile> [argomenti...]" >&2; exit 2; }
exe=$(cygpath -m "$1")
shift
command="\"$exe\""
for argument in "$@"; do
    command+=" \"$argument\""
done

MSYS2_ARG_CONV_EXCL='*' /c/Windows/System32/runas.exe /trustlevel:0x20000 "$command"
