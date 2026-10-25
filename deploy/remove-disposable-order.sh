#!/usr/bin/env bash
# One-time approved Ubuntu VM maintenance. Always restart the app on failure too.
set -euo pipefail
if [[ "$EUID" -ne 0 ]]; then
  echo 'Run this reviewed maintenance wrapper as root.' >&2
  exit 1
fi
cleanup() {
  systemctl start luigis.service
}
trap cleanup EXIT
systemctl stop luigis.service
if systemctl is-active --quiet luigis.service; then
  echo 'Application did not stop; refusing database maintenance.' >&2
  exit 1
fi
/opt/luigis/runtime/bin/node /tmp/luigis-remove-disposable-order.mjs \
  /var/lib/luigis-data/luigis-demo.sqlite apply-approved-removal
systemctl start luigis.service
for attempt in {1..20}; do
  if curl --fail --silent --output /dev/null https://luigispizzeria.duckdns.org/health/ready; then
    echo 'HOSTED_READINESS_PASSED'
    exit 0
  fi
  sleep 2
done
echo 'Application restarted but readiness has not passed; investigate.' >&2
exit 1
