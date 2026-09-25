#!/usr/bin/env bash
# =====================================================================
# Sviluppo CounselorBot — Avvia `next dev` con hot reload.
# NON tocca i container di produzione (frontend prod resta su :3000 —
# la dev gira qui sulla 3107).
# Usa frontend/.env.development per BACKEND_ORIGIN=http://127.0.0.1:8002
# Così /api/* arriva al FastAPI di sviluppo e non a produzione.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/../frontend"
exec npm run dev -- --hostname 127.0.0.1 --port 3107
