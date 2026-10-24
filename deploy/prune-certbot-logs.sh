#!/usr/bin/env bash
set -euo pipefail
[[ "$(id -u)" == 0 && ! -L /var/log/letsencrypt && "$(stat -c '%u:%a' /var/log/letsencrypt)" == 0:700 ]] || exit 1
# Only rotated Certbot logs in its verified private log directory; never keys/accounts.
find /var/log/letsencrypt -xdev -maxdepth 1 -type f -name 'letsencrypt.log.[0-9]*' -mtime +6 -delete
