#!/usr/bin/env bash
set -euo pipefail
[[ "${RENEWED_LINEAGE:-}" == /etc/letsencrypt/live/luigispizzeria.duckdns.org ]] || exit 0
exec flock -n /run/luigis-tls-install.lock /opt/luigis/runtime/bin/node \
  /opt/luigis/current/scripts/install-tls.js \
  "$RENEWED_LINEAGE/privkey.pem" "$RENEWED_LINEAGE/fullchain.pem" luigispizzeria.duckdns.org
