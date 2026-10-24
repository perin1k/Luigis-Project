#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "$(id -u)" == 0 && -d /etc/luigis && ! -e /etc/luigis/duckdns-token.txt && ! -e /etc/luigis/dns-transfer.key ]] || exit 1
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out /etc/luigis/dns-transfer.key 2>/dev/null
openssl pkey -in /etc/luigis/dns-transfer.key -pubout -out /tmp/luigis-dns-transfer.pub
chmod 0644 /tmp/luigis-dns-transfer.pub
echo 'One-time VM public key prepared; private key remains on this VM.'
