#!/usr/bin/env bash
set -euo pipefail
umask 022
[[ "$(id -u)" == 0 ]] || { echo 'Root operator required.' >&2; exit 1; }
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 && "$(uname -m)" == x86_64 ]] || { echo 'Approved Ubuntu24.04 amd64 required.' >&2; exit 1; }
strMode="${1:-}"
strData=/var/lib/luigis-data
strRuntime=/opt/luigis/runtime

if [[ "$strMode" == system ]]; then
  apt-get -o DPkg::Lock::Timeout=180 update -qq
  DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=180 install -y -qq ca-certificates curl xz-utils openssl certbot
  if ! id luigis >/dev/null 2>&1; then useradd --system --user-group --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin luigis; fi
  [[ "$(id -u luigis)" != 0 ]] || exit 1
  install -d -o root -g root -m 0755 /opt/luigis /opt/luigis/releases
  if [[ ! -e "$strRuntime" ]]; then
    strStage="$(mktemp -d /var/tmp/luigis-install.XXXXXXXX)"
    trap 'if [[ "$strStage" == /var/tmp/luigis-install.* && -d "$strStage" ]]; then rm -rf -- "$strStage"; fi' EXIT
    strPackage=node-v24.22.1-linux-x64.tar.xz
    curl --fail --silent --show-error --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v24.22.1/$strPackage" -o "$strStage/$strPackage"
    curl --fail --silent --show-error --proto '=https' --tlsv1.2 https://nodejs.org/dist/v24.22.1/SHASUMS256.txt -o "$strStage/SHASUMS256.txt"
    (cd "$strStage"; grep "  $strPackage\$" SHASUMS256.txt | sha256sum --check --status)
    install -d -o root -g root -m 0755 "$strRuntime"
    tar --extract --xz --file "$strStage/$strPackage" --directory "$strRuntime" --strip-components=1 --no-same-owner
    chown -R root:root "$strRuntime"
    chmod -R go-w "$strRuntime"
  fi
  [[ "$("$strRuntime/bin/node" --version)" == v24.22.1 ]] || { echo 'Runtime version differs; no overwrite.' >&2; exit 1; }
  [[ "$("$strRuntime/bin/node" "$strRuntime/lib/node_modules/npm/bin/npm-cli.js" --version)" == 11.19.1 ]] || exit 1
  strDevice="$(readlink -f /dev/disk/by-id/google-luigis-data)"
  [[ -b "$strDevice" && "$(lsblk -dn -o TYPE "$strDevice")" == disk && "$(blockdev --getsize64 "$strDevice")" == 10737418240 ]] || { echo 'Expected dedicated10GB data device missing.' >&2; exit 1; }
  strType="$(blkid -s TYPE -o value "$strDevice" || true)"
  if [[ -z "$strType" ]]; then
    [[ -z "$(lsblk -n -o MOUNTPOINT "$strDevice" | tr -d '[:space:]')" && "$(lsblk -n -o NAME "$strDevice" | wc -l)" == 1 ]] || { echo 'Device is in use; refusing format.' >&2; exit 1; }
    mkfs.ext4 -q -L luigis-data "$strDevice"
  elif [[ "$strType" != ext4 ]]; then echo 'Existing data filesystem differs; no format.' >&2; exit 1; fi
  strUuid="$(blkid -s UUID -o value "$strDevice")"
  [[ "$strUuid" =~ ^[a-f0-9-]+$ ]] || exit 1
  install -d -o root -g root -m 0700 "$strData"
  if ! grep -Fq "UUID=$strUuid $strData " /etc/fstab; then
    if grep -Eq '[[:space:]]/var/lib/luigis-data[[:space:]]' /etc/fstab; then echo 'Existing mount configuration differs.' >&2; exit 1; fi
    printf 'UUID=%s %s ext4 defaults,nodev,nosuid,noexec,nofail 0 2\n' "$strUuid" "$strData" >> /etc/fstab
  fi
  if ! mountpoint -q "$strData"; then mount "$strData"; fi
  [[ "$(findmnt -n -o UUID --target "$strData")" == "$strUuid" ]] || { echo 'Wrong mounted device.' >&2; exit 1; }
  chown luigis:luigis "$strData"; chmod 0700 "$strData"
  echo 'System runtime and verified private data mount prepared.'
elif [[ "$strMode" == release ]]; then
  strCommit="${2:-}";strArchive="${3:-}";strDigest="${4:-}"
  [[ "$strCommit" =~ ^[a-f0-9]{40}$ && "$strDigest" =~ ^[a-f0-9]{64}$ && -f "$strArchive" ]] || exit 1
  mountpoint -q "$strData" || { echo 'Required data mount absent.' >&2; exit 1; }
  printf '%s  %s\n' "$strDigest" "$strArchive" | sha256sum --check --status
  strRelease="/opt/luigis/releases/$strCommit"
  if [[ ! -e "$strRelease" ]]; then
    install -d -o root -g root -m 0755 "$strRelease"
    while IFS= read -r strEntry; do
      [[ "$strEntry" != /* && "$strEntry" != *../* ]] || exit 1
      case "$strEntry" in src/*|scripts/*|deploy/*|package.json|package-lock.json) ;; *) echo 'Unexpected archive path.' >&2; exit 1;; esac
    done < <(tar -tf "$strArchive")
    tar --extract --file "$strArchive" --directory "$strRelease" --no-same-owner --no-same-permissions
    (cd "$strRelease"; "$strRuntime/bin/node" "$strRuntime/lib/node_modules/npm/bin/npm-cli.js" ci --omit=dev --ignore-scripts)
    "$strRuntime/bin/node" "$strRelease/scripts/release.js" manifest "$strRelease" "$strCommit"
    chown -R root:root "$strRelease";chmod -R go-w "$strRelease"
  fi
  (umask 077; export DATABASE_PATH="$strData/luigis-demo.sqlite"; runuser -u luigis -- "$strRuntime/bin/node" "$strRelease/scripts/migrate.js"; runuser -u luigis -- "$strRuntime/bin/node" "$strRelease/scripts/seed-menu.js")
  if [[ ! -e /etc/luigis ]]; then
    "$strRuntime/bin/node" "$strRelease/scripts/setup-host-secrets.js" create /etc/luigis "$strData" "$strRelease" https://luigispizzeria.duckdns.org hosted-demo
  else
    [[ -f /etc/luigis/runtime.env && -f /etc/luigis/payment-keys.json ]] || { echo 'Partial private setup needs operator review.' >&2; exit 1; }
  fi
  if [[ -e /opt/luigis/current || -L /opt/luigis/current ]]; then
    [[ "$(readlink -f /opt/luigis/current)" == "$strRelease" ]] || { echo 'Release switch needs stopped compatibility review.' >&2; exit 1; }
  else ln -s "$strRelease" /opt/luigis/current; fi
  install -o root -g root -m 0644 "$strRelease/deploy/luigis.service" /etc/systemd/system/luigis.service
  install -o root -g root -m 0644 "$strRelease/deploy/luigis-dns.service" /etc/systemd/system/luigis-dns.service
  install -o root -g root -m 0644 "$strRelease/deploy/luigis-dns.timer" /etc/systemd/system/luigis-dns.timer
  install -d -o root -g root -m 0755 /etc/letsencrypt/renewal-hooks/deploy
  install -o root -g root -m 0755 "$strRelease/deploy/certbot-deploy-hook.sh" /etc/letsencrypt/renewal-hooks/deploy/luigis-tls
  install -o root -g root -m 0755 "$strRelease/deploy/owner-setup.sh" /usr/local/sbin/luigis-owner-setup
  systemd-analyze verify /etc/systemd/system/luigis.service
  systemd-analyze verify /etc/systemd/system/luigis-dns.service /etc/systemd/system/luigis-dns.timer
  systemctl daemon-reload
  echo 'Release installed; application remains stopped for TLS and private Owner enrollment.'
else echo 'Expected system or release.' >&2; exit 1; fi
