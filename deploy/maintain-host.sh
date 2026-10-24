#!/usr/bin/env bash
set -euo pipefail
umask 022
[[ "$(id -u)" == 0 ]] || exit 1
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 && "$(uname -m)" == x86_64 ]] || exit 1
strMode=${1:-}
strPatched=/opt/luigis/runtimes/node-v24.22.1
strRepository=https://github.com/perin1k/Luigis-Project.git
cleanStage(){ if [[ "${strStage:-}" == /var/tmp/luigis-maintenance.* && -d "$strStage" ]]; then rm -rf -- "$strStage"; fi; }

if [[ "$strMode" == stage ]]; then
  [[ $# == 1 ]] || exit 1
  install -d -o root -g root -m 0755 /opt/luigis/runtimes
  if [[ ! -e "$strPatched" ]]; then
    strStage=$(mktemp -d /var/tmp/luigis-maintenance.XXXXXXXX)
    trap cleanStage EXIT
    strPackage=node-v24.22.1-linux-x64.tar.xz
    curl --fail --silent --show-error --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v24.22.1/$strPackage" -o "$strStage/$strPackage"
    curl --fail --silent --show-error --proto '=https' --tlsv1.2 https://nodejs.org/dist/v24.22.1/SHASUMS256.txt -o "$strStage/SHASUMS256.txt"
    (cd "$strStage"; grep "  $strPackage\$" SHASUMS256.txt | sha256sum --check --status)
    install -d -o root -g root -m 0755 "$strPatched"
    tar --extract --xz --file "$strStage/$strPackage" --directory "$strPatched" --strip-components=1 --no-same-owner
    chown -R root:root "$strPatched";chmod -R go-w "$strPatched"
  fi
  [[ "$("$strPatched/bin/node" --version)" == v24.22.1 && "$("$strPatched/bin/node" "$strPatched/lib/node_modules/npm/bin/npm-cli.js" --version)" == 11.19.1 ]] || exit 1
  echo 'Patched runtime staged; active application unchanged.'
elif [[ "$strMode" == prepare ]]; then
  strCommit=${2:-}
  [[ $# == 2 && "$strCommit" =~ ^[a-f0-9]{40}$ && -x "$strPatched/bin/node" ]] || exit 1
  command -v git >/dev/null
  strRelease=/opt/luigis/releases/$strCommit-node-24.22.1
  [[ ! -e "$strRelease" ]] || { echo 'Existing release requires integrity review; no overwrite.' >&2; exit 1; }
  mountpoint -q /var/lib/luigis-data
  strStage=$(mktemp -d /var/tmp/luigis-maintenance.XXXXXXXX)
  trap cleanStage EXIT
  git -c credential.helper= -c core.hooksPath=/dev/null clone --quiet --no-checkout --depth=1 --branch=dev "$strRepository" "$strStage/checkout"
  git -c credential.helper= -C "$strStage/checkout" fetch --quiet --depth=1 origin "$strCommit"
  git -C "$strStage/checkout" checkout --quiet --detach "$strCommit"
  [[ "$(git -C "$strStage/checkout" rev-parse HEAD)" == "$strCommit" && -z "$(git -C "$strStage/checkout" status --porcelain)" ]] || exit 1
  # Preserve the existing live migration bytes without editing SQL or DB checksums.
  printf 'src/data/migrations/*.sql text eol=crlf\n' > "$strStage/archive-attributes"
  git -c core.autocrlf=false -c core.attributesFile="$strStage/archive-attributes" -C "$strStage/checkout" archive --format=tar --output="$strStage/source.tar" "$strCommit" src scripts deploy package.json package-lock.json
  echo "Reviewed clean-checkout source: $strCommit"
  sha256sum "$strStage/source.tar" | cut -d ' ' -f 1
  install -d -o root -g root -m 0755 "$strRelease"
  tar --extract --file "$strStage/source.tar" --directory "$strRelease" --no-same-owner --no-same-permissions
  (cd "$strRelease"; "$strPatched/bin/node" "$strPatched/lib/node_modules/npm/bin/npm-cli.js" ci --omit=dev --ignore-scripts)
  "$strPatched/bin/node" "$strRelease/scripts/release.js" manifest "$strRelease" "$strCommit"
  chown -R root:root "$strRelease";chmod -R go-w "$strRelease"
  runuser -u luigis -- env DATABASE_PATH=/var/lib/luigis-data/luigis-demo.sqlite "$strPatched/bin/node" "$strRelease/scripts/release.js" check "$strRelease" ready
  echo 'Clean-checkout release prepared; no hosted seed, migration or credential replacement performed.'
elif [[ "$strMode" == activate ]]; then
  strCommit=${2:-};strFallback=${3:-}
  [[ $# == 3 && "$strCommit" =~ ^[a-f0-9]{40}$ && "$strFallback" =~ ^[a-f0-9]{40}$ ]] || exit 1
  strRelease=/opt/luigis/releases/$strCommit-node-24.22.1
  strFallbackRelease=/opt/luigis/releases/$strFallback-node-24.22.1
  for strCandidate in "$strRelease" "$strFallbackRelease"; do
    runuser -u luigis -- env DATABASE_PATH=/var/lib/luigis-data/luigis-demo.sqlite "$strPatched/bin/node" "$strCandidate/scripts/release.js" check "$strCandidate" ready
  done
  [[ ! -e /opt/luigis/runtime.next && ! -L /opt/luigis/runtime.next && ! -e /opt/luigis/current.next && ! -L /opt/luigis/current.next ]] || exit 1
  strRuntimeVersion=$(/opt/luigis/runtime/bin/node --version)
  [[ "$strRuntimeVersion" == v24.14.1 || "$strRuntimeVersion" == v24.22.1 ]] || exit 1
  if [[ -d /opt/luigis/runtime && ! -L /opt/luigis/runtime ]]; then
    [[ "$strRuntimeVersion" == v24.14.1 && ! -e /opt/luigis/runtimes/node-v24.14.1 ]] || exit 1
  fi
  pointTo(){ ln -s "$1" /opt/luigis/current.next;mv -T /opt/luigis/current.next /opt/luigis/current; }
  recover(){ systemctl stop luigis.service || true;pointTo "$strFallbackRelease";systemctl reset-failed luigis.service;systemctl start luigis.service;echo 'Patched-runtime fallback started; verify trusted health before resuming.' >&2; }
  systemctl stop luigis.service
  if [[ ! -L /opt/luigis/runtime ]]; then mv /opt/luigis/runtime /opt/luigis/runtimes/node-v24.14.1;fi
  ln -s "$strPatched" /opt/luigis/runtime.next
  mv -T /opt/luigis/runtime.next /opt/luigis/runtime
  trap recover ERR
  pointTo "$strRelease"
  systemctl start luigis.service
  curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 --resolve luigispizzeria.duckdns.org:443:127.0.0.1 https://luigispizzeria.duckdns.org/health/ready
  trap - ERR
  echo 'Patched runtime and reviewed release active; prior data/keys retained.'
else echo 'Expected stage, prepare COMMIT, or activate COMMIT FALLBACK_COMMIT.' >&2;exit 1;fi
