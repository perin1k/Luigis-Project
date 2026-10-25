#!/usr/bin/env bash
set -euo pipefail
[[ "$(id -u)" == 0 && -t 0 && -t 1 ]] || { echo 'Use the operator private interactive terminal.' >&2; exit 1; }
mountpoint -q /var/lib/luigis-data || exit 1
if systemctl is-active --quiet luigis.service; then echo 'Application must be stopped for initial Owner setup.' >&2; exit 1; fi
systemd-run --unit=luigis-owner-setup --pty --wait --collect --service-type=exec \
  --property=User=luigis --property=Group=luigis \
  --property=WorkingDirectory=/opt/luigis/current \
  --property=EnvironmentFile=/etc/luigis/runtime.env --property=UMask=0077 \
  --property=NoNewPrivileges=yes --property=ProtectSystem=strict \
  --property=RequiresMountsFor=/var/lib/luigis-data \
  --property=AssertPathIsMountPoint=/var/lib/luigis-data \
  --property=ReadWritePaths=/var/lib/luigis-data \
  /opt/luigis/runtime/bin/node /opt/luigis/current/scripts/setup-admin.js
systemctl enable --now luigis.service
echo 'Owner enrollment completed and HTTPS preview started. Keep all recovery codes private.'
