#!/usr/bin/env bash
# Runs the app's real query shapes through PostgREST against a throwaway database with all migrations applied.
# Needs: psql + standard PG* env vars (superuser), node, and a PostgREST binary (POSTGREST_BIN, default `postgrest` on PATH).
set -euo pipefail
cd "$(dirname "$0")/.."
DB="sitesync_api_$$"; PORT="${POSTGREST_PORT:-3001}"; SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
BIN="${POSTGREST_BIN:-postgrest}"
HOST="${PGHOST:-localhost}"; PGPORT_="${PGPORT:-5432}"
psql -q -d postgres -c "create database $DB"
PID=""
cleanup() { [ -n "$PID" ] && kill "$PID" 2>/dev/null || true; psql -q -d postgres -c "drop database if exists $DB" >/dev/null || true; }
trap cleanup EXIT
for f in supabase/tests/stub.sql supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" 2>&1 | grep -vE "wal_level|HINT|NOTICE" || true; done
psql -q -d "$DB" <<SQL
do \$\$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login password 'pw' noinherit; end if; end \$\$;
grant anon, authenticated to authenticator;
SQL
CONF="$(mktemp)"
cat > "$CONF" <<CONF
db-uri = "postgres://authenticator:pw@$HOST:$PGPORT_/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = $PORT
CONF
"$BIN" "$CONF" >/tmp/postgrest.log 2>&1 & PID=$!
for i in $(seq 1 30); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 1; done
DATABASE_URL="postgres://${PGUSER:-postgres}:${PGPASSWORD:-}@$HOST:$PGPORT_/$DB" POSTGREST_URL="http://localhost:$PORT" JWT_SECRET="$SECRET" node scripts/test-api.mjs
