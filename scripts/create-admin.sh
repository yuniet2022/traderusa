#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
read -r -p 'Usuario del administrador: ' TRADER_ADMIN_USER
read -r -s -p 'Contraseña (mínimo 12 caracteres): ' TRADER_ADMIN_PASSWORD
printf '\n'
read -r -s -p 'Repite la contraseña: ' confirmation
printf '\n'
if [ "$TRADER_ADMIN_PASSWORD" != "$confirmation" ]; then
  printf '%s\n' 'Las contraseñas no coinciden.' >&2
  exit 1
fi
export TRADER_ADMIN_USER TRADER_ADMIN_PASSWORD
trap 'unset TRADER_ADMIN_USER TRADER_ADMIN_PASSWORD confirmation' EXIT
docker compose --env-file .env.production.local -f compose.production.yml exec -T \
  -e TRADER_ADMIN_USER -e TRADER_ADMIN_PASSWORD app node dist/create-admin.js
