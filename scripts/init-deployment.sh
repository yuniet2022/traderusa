#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [ -e .env.production.local ]; then
  printf '%s\n' 'La configuración ya existe; se conserva sin cambios.'
  exit 0
fi
command -v openssl >/dev/null
umask 077
temporary=$(mktemp .deployment-settings.XXXXXX)
trap 'rm -f "$temporary"' EXIT
{
  printf 'TRADER_DB_ROOT_PASSWORD=%s\n' "$(openssl rand -hex 32)"
  printf 'TRADER_DB_PASSWORD=%s\n' "$(openssl rand -hex 32)"
  printf 'TRADER_APP_SECRET=%s\n' "$(openssl rand -hex 32)"
  printf 'TRADER_LOCAL_PORT=3001\n'
} > "$temporary"
# Hard-link creation refuses to replace a concurrently created configuration.
ln "$temporary" .env.production.local
printf '%s\n' 'Configuración generada en .env.production.local (permisos 600).'
