#!/usr/bin/env bash
# Authorized operator only. Recover by transport mode, never downgrade source/schema.
set -euo pipefail
[[ $(id -u) == 0 && $# == 1 ]] || exit 1
cd /opt/luigis/current
strProxy=/etc/luigis/proxy
strAppDrop=/etc/systemd/system/luigis.service.d/90-luigis-proxy.conf
strNginxDrop=/etc/systemd/system/nginx.service.d/90-luigis-proxy.conf
[[ -f "$strProxy/runtime.direct.env" && -f "$strProxy/runtime.proxy.env" && -f "$strProxy/nginx.conf" ]] || exit 1
healthy(){ curl --fail --silent --show-error --retry 12 --retry-connrefused --retry-delay 1 --resolve luigispizzeria.duckdns.org:443:127.0.0.1 https://luigispizzeria.duckdns.org/health/ready >/dev/null; }
restoreDirect(){
  systemctl disable --now nginx.service >/dev/null 2>&1 || true
  systemctl stop luigis.service
  install -o root -g root -m 600 "$strProxy/runtime.direct.env" /etc/luigis/runtime.env
  # Remove only this increment's known drop-in; preserve any other service settings.
  if [[ -e "$strAppDrop" ]]; then cmp -s deploy/luigis-proxy.conf "$strAppDrop" || return 1;rm -- "$strAppDrop";fi
  systemctl daemon-reload
  systemctl reset-failed luigis.service
  systemctl start luigis.service
  healthy
  echo 'Current release restored to direct HTTPS; database and keys retained.'
}
if [[ "$1" == restore-direct ]]; then restoreDirect;exit 0;fi
[[ "$1" == activate && ! -e "$strAppDrop" ]] || exit 1
if [[ -e "$strNginxDrop" ]]; then cmp -s deploy/nginx-service.conf "$strNginxDrop" || exit 1;fi
nginx -t -q -c "$strProxy/nginx.conf"
mkdir -p /etc/systemd/system/luigis.service.d /etc/systemd/system/nginx.service.d
install -o root -g root -m 644 deploy/nginx-service.conf "$strNginxDrop"
trap 'echo "Proxy activation failed; attempting current-release direct HTTPS recovery." >&2;restoreDirect' ERR
systemctl stop luigis.service
install -o root -g root -m 600 "$strProxy/runtime.proxy.env" /etc/luigis/runtime.env
install -o root -g root -m 644 deploy/luigis-proxy.conf "$strAppDrop"
systemctl daemon-reload
systemctl reset-failed luigis.service
systemctl start luigis.service
systemctl unmask nginx.service
systemctl daemon-reload
systemctl enable --now nginx.service
healthy
trap - ERR
echo 'Nginx HTTPS edge and private TLS backend active; verify public and staff/customer flows.'
