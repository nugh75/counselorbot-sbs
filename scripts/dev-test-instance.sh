#!/usr/bin/env bash
# =====================================================================
# Test instance with hot reload.
#
# Starts CounselorBot with Next.js dev mode and uvicorn --reload, mounting
# frontend and backend source into the containers. Code changes do not rebuild
# images. Use this only on a disposable/test instance: development mode exposes
# debug information and is not a production deployment.
#
# Usage:
#   scripts/dev-test-instance.sh up       # start (builds the dev image once)
#   scripts/dev-test-instance.sh logs     # follow frontend/backend logs
#   scripts/dev-test-instance.sh status   # compose status
#   scripts/dev-test-instance.sh stop     # stop frontend/backend only
#   scripts/dev-test-instance.sh rebuild  # after package.json/requirements changes
#   scripts/dev-test-instance.sh prod     # switch back to production images
#   scripts/dev-test-instance.sh clean    # prune dangling images/build cache
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose --env-file .env -f docker-compose.portable.yml)
DEV_COMPOSE=("${COMPOSE[@]}" -f docker-compose.portable.dev.yml)
FRONTEND_DEV_IMAGE="counselorbot-portable-counselorbot-frontend:dev"

case "${1:-up}" in
  up)
    if ! docker image inspect "$FRONTEND_DEV_IMAGE" >/dev/null 2>&1; then
      "${DEV_COMPOSE[@]}" build counselorbot-frontend
    fi
    "${DEV_COMPOSE[@]}" up -d counselorbot-backend counselorbot-frontend
    ;;
  rebuild)
    "${DEV_COMPOSE[@]}" build counselorbot-frontend
    "${DEV_COMPOSE[@]}" up -d --force-recreate counselorbot-backend counselorbot-frontend
    ;;
  logs)
    "${DEV_COMPOSE[@]}" logs -f --tail=100 counselorbot-backend counselorbot-frontend
    ;;
  status)
    "${DEV_COMPOSE[@]}" ps
    ;;
  stop)
    "${DEV_COMPOSE[@]}" stop counselorbot-backend counselorbot-frontend
    ;;
  prod)
    "${COMPOSE[@]}" up -d counselorbot-backend counselorbot-frontend
    ;;
  clean)
    docker image prune -f
    docker builder prune -f | tail -n 1
    docker container prune -f --filter label=com.docker.compose.project=counselorbot-portable
    ;;
  *)
    echo "Uso: $0 {up|rebuild|logs|status|stop|prod|clean}" >&2
    exit 1
    ;;
esac
