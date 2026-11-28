#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the source database URL}"
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to a separate, empty PostgreSQL database}"

# Prisma's `schema` query option is not a libpq URI parameter.
source_pg_url="$(DATABASE_URL="$DATABASE_URL" node --input-type=module -e 'const url = new URL(process.env.DATABASE_URL); url.searchParams.delete("schema"); process.stdout.write(url.toString())')"
target_pg_url="$(RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" node --input-type=module -e 'const url = new URL(process.env.RESTORE_DATABASE_URL); url.searchParams.delete("schema"); process.stdout.write(url.toString())')"

archive="${1:?Usage: RESTORE_DATABASE_URL=... $0 <backup.dump> [backup.dump.sha256]}"
manifest="${2:-$archive.sha256}"
[[ -f "$archive" ]] || { echo "Backup archive not found" >&2; exit 1; }
[[ -f "$manifest" ]] || { echo "Checksum manifest not found" >&2; exit 1; }

if command -v shasum >/dev/null 2>&1; then
  (cd "$(dirname "$manifest")" && shasum -a 256 --check "$(basename "$manifest")")
else
  (cd "$(dirname "$manifest")" && sha256sum --check "$(basename "$manifest")")
fi
if [[ -n "${PG_CLIENT_COMPOSE_SERVICE:-}" ]]; then
  : "${PG_CLIENT_RESTORE_URL:?Set PG_CLIENT_RESTORE_URL to the empty target URL reachable from the Compose service}"
  compose_target_url="$(PG_CLIENT_RESTORE_URL="$PG_CLIENT_RESTORE_URL" node --input-type=module -e 'const url = new URL(process.env.PG_CLIENT_RESTORE_URL); url.searchParams.delete("schema"); process.stdout.write(url.toString())')"
  docker compose exec -T "$PG_CLIENT_COMPOSE_SERVICE" pg_restore --list \
    <"$archive" >/dev/null
else
  pg_restore --list "$archive" >/dev/null
fi

source_identity="$(psql "$source_pg_url" --set ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT current_database() || ':' || COALESCE(inet_server_addr()::text, 'local') || ':' || inet_server_port()")"
target_identity="$(psql "$target_pg_url" --set ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT current_database() || ':' || COALESCE(inet_server_addr()::text, 'local') || ':' || inet_server_port()")"
if [[ "$source_identity" == "$target_identity" ]]; then
  echo "Refusing to restore into the source database" >&2
  exit 1
fi

target_objects="$(psql "$target_pg_url" --set ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) + (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public') AND nspname NOT LIKE 'pg_toast%')")"
if [[ "$target_objects" != "0" ]]; then
  echo "Refusing to restore: target database is not empty" >&2
  exit 1
fi

if [[ -n "${PG_CLIENT_COMPOSE_SERVICE:-}" ]]; then
  docker compose exec -T "$PG_CLIENT_COMPOSE_SERVICE" pg_restore \
    --no-owner --no-acl --exit-on-error --single-transaction \
    --dbname="$compose_target_url" <"$archive"
else
  pg_restore --no-owner --no-acl --exit-on-error --single-transaction --dbname="$target_pg_url" "$archive"
fi
echo "Restore completed into the separate empty target database. Run application schema and reconciliation checks before directing traffic to it."
