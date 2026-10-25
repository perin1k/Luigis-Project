#!/usr/bin/env bash
set -euo pipefail
[[ "${RENEWED_LINEAGE:-}" == /etc/letsencrypt/live/luigispizzeria.duckdns.org ]] || exit 0
cd /opt/luigis/current
flock -n /run/luigis-tls-install.lock /opt/luigis/runtime/bin/node \
  scripts/install-tls.js \
  "$RENEWED_LINEAGE/privkey.pem" "$RENEWED_LINEAGE/fullchain.pem" luigispizzeria.duckdns.org
# Keep the public edge and verified local TLS hop on the renewed certificate.
if systemctl is-active --quiet nginx; then
  nginx -t -q -c /etc/luigis/proxy/nginx.conf
  systemctl reload nginx
fi
