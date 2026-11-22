#!/bin/sh
set -e

if [ -z "${DATABASE_URL:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
  ENCODED_PASS=$(node -e "process.stdout.write(encodeURIComponent(process.env.POSTGRES_PASSWORD || ''))")
  PG_USER="${POSTGRES_USER:-sharm}"
  PG_HOST="${POSTGRES_HOST:-postgres}"
  PG_PORT="${POSTGRES_PORT:-5432}"
  PG_DB="${POSTGRES_DB:-sharm_pharaoh_prod}"
  export DATABASE_URL="postgresql://${PG_USER}:${ENCODED_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}?schema=public"
fi

if [ -z "${PUBLIC_SITE_URL:-}" ] || [ "${PUBLIC_SITE_URL}" = "http://localhost:3000" ]; then
  if [ -n "${SERVICE_URL_PROXY:-}" ]; then
    export PUBLIC_SITE_URL=$(node -e "process.stdout.write((process.env.SERVICE_URL_PROXY || '').replace(/\/+$/, ''))")
  fi
fi

exec "$@"
