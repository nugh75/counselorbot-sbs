#!/bin/sh
set -eu
worker_password=$(cat /run/lab-worker/password)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=worker_password="$worker_password" <<'SQL'
CREATE ROLE prompt_lab_worker LOGIN PASSWORD :'worker_password';
REVOKE ALL ON DATABASE prompt_lab FROM PUBLIC;
GRANT CONNECT ON DATABASE prompt_lab TO prompt_lab_worker;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
