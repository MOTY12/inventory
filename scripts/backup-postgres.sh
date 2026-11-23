#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the PostgreSQL database to back up}"

# Prisma's `schema` query option is not a libpq URI parameter.
pg_database_url="$(DATABASE_URL="$DATABASE_URL" node --input-type=module -e 'const url = new URL(process.env.DATABASE_URL); url.searchParams.delete("schema"); process.stdout.write(url.toString())')"

output_dir="${1:-./backups}"
mkdir -p "$output_dir"
chmod 700 "$output_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$output_dir/inventory-${timestamp}.dump"
manifest="$archive.sha256"

if [[ -e "$archive" || -e "$manifest" ]]; then
  echo "Refusing to overwrite an existing backup artifact" >&2
  exit 1
fi

umask 077
if [[ -n "${PG_CLIENT_COMPOSE_SERVICE:-}" ]]; then
  : "${PG_CLIENT_DATABASE_URL:?Set PG_CLIENT_DATABASE_URL to a connection URL reachable from the Compose service}"
  compose_database_url="$(PG_CLIENT_DATABASE_URL="$PG_CLIENT_DATABASE_URL" node --input-type=module -e 'const url = new URL(process.env.PG_CLIENT_DATABASE_URL); url.searchParams.delete("schema"); process.stdout.write(url.toString())')"
  docker compose exec -T "$PG_CLIENT_COMPOSE_SERVICE" pg_dump \
    --format=custom --no-owner --no-acl "$compose_database_url" >"$archive"
  docker compose exec -T "$PG_CLIENT_COMPOSE_SERVICE" pg_restore --list \
    <"$archive" >/dev/null
else
  pg_dump --format=custom --no-owner --no-acl --file="$archive" "$pg_database_url"
  pg_restore --list "$archive" >/dev/null
fi
if command -v shasum >/dev/null 2>&1; then
  (cd "$output_dir" && shasum -a 256 "$(basename "$archive")" >"$(basename "$manifest")")
else
  (cd "$output_dir" && sha256sum "$(basename "$archive")" >"$(basename "$manifest")")
fi

echo "Backup archive created and validated: $archive"
echo "Checksum manifest: $manifest"
