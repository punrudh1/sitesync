#!/usr/bin/env bash
# Applies the stub, all migrations and the security tests to a throwaway Postgres database.
# Uses the standard PG* environment variables (PGHOST, PGUSER, PGPASSWORD...). Needs Postgres 15+.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="sitesync_test_$$"
psql -q -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
for f in supabase/tests/stub.sql supabase/migrations/*.sql supabase/tests/rls.test.sql; do
  echo "== $f"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
