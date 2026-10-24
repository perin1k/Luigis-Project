#!/usr/bin/env bash
set -euo pipefail
[[ "${RENEWED_LINEAGE:-}" == /etc/letsencrypt/live/luigispizzeria.duckdns.org ]] || exit 0
cd /opt/luigis/current
exec flock -n /run/luigis-tls-install.lock /opt/luigis/runtime/bin/node \
  scripts/install-tls.js \
  "$RENEWED_LINEAGE/privkey.pem" "$RENEWED_LINEAGE/fullchain.pem" luigispizzeria.duckdns.org
