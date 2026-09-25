#!/usr/bin/env bash
# =====================================================================
# Sviluppo CounselorBot — NON tocca i container di produzione.
# Avvia FastAPI con reload sull'host, collegato al Postgres DI TEST
# (counselorbot_test, schema a rollback automatico creato a ogni sessione).
# Production continua a girare su Docker: backend :8088, frontend :3000.
# Porta di sviluppo: 8001 (distinta da produzione 8088/8000).
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # root del repository

source .env   # chiavi AI, credenziali Postgres, TELEGRAM ecc.

# Postgres DI TEST (stesso server di produzione, database counselorbot_test):
# la copia di counselorbot_test viene creata al volo e ogni test/sessione
# lavora in uno schema che viene distrutto alla fine.
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/counselorbot_test"
export OMNIROUTE_API_URL="${OMNIROUTE_API_URL:-http://127.0.0.1:20128/v1}"
export AI4AUTH_VERIFY_URL="${AI4AUTH_VERIFY_URL:-}"
export AI4AUTH_PUBLIC_HOST="${AI4AUTH_PUBLIC_HOST:-counselorbot-sbs.ai4educ.org}"
export ADMIN_GROUPS="${ADMIN_GROUPS:-admins,counselorbot-sbs-admin}"
export SESSION_MEMORY_DIR="$(dirname "$0")/../session_memory_dev"
export RAG_DOCS_DIR="$(dirname "$0")/../docs"
export RAG_INDEX_DIR="$(dirname "$0")/../rag_index_dev"
export COUNSELORBOT_DOCS_DIR="$(dirname "$0")/../docs-counselorbot"
# Canale fidato per gli header Remote-* iniettati dal proxy di sviluppo
# (frontend/src/proxy.ts): stesso valore di DEV_AUTH_SECRET in .env.development.
export FORWARD_AUTH_SHARED_SECRET="${FORWARD_AUTH_SHARED_SECRET:-dev-local-only}"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
export TESSDATA_PREFIX="$HOME/.local/opt/tessdata"
export PATH="$HOME/.local/opt/graphviz/usr/bin:$HOME/.local/opt/tesseract/usr/bin:$PATH"
export LD_LIBRARY_PATH="$HOME/.local/opt/graphviz/usr/lib/x86_64-linux-gnu:$HOME/.local/opt/tesseract/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"

mkdir -p "$SESSION_MEMORY_DIR" "$RAG_INDEX_DIR"

exec "$HOME/counselorbot-sbs/backend/.venv/bin/uvicorn" backend.main:app \
    --reload --host 127.0.0.1 --port 8002
