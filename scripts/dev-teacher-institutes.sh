#!/usr/bin/env bash
# Secret-free TF1 dev runners; only the synthetic test cluster is allowed.
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in
  backend)
    export DATABASE_URL=postgresql://c3_test@127.0.0.1:18648/counselorbot_test
    export DEV_BACKEND_PORT=8148
    exec bash scripts/dev-class-settings-backend.sh
    ;;
  frontend)
    export DEV_FRONTEND_PORT=3148 DEV_BACKEND_PORT=8148 DEV_AUTH_USER=first
    exec bash scripts/dev-class-settings-frontend.sh
    ;;
  *) echo 'Usage: scripts/dev-teacher-institutes.sh backend|frontend' >&2; exit 1 ;;
esac
