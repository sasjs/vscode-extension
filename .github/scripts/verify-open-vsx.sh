#!/usr/bin/env bash
# A retry may find an existing Open VSX version. Never attest a rebuilt VSIX
# unless its bytes match the marketplace artifact that --skip-duplicate retained.
set -euo pipefail

if [ "$#" -ne 4 ]; then
  printf 'usage: %s <vsix> <namespace> <extension> <version>\n' "$0" >&2
  exit 1
fi
vsix=$1
namespace=${2,,}
name=$3
version=$4
for part in "$namespace" "$name" "$version"; do
  if [[ ! "$part" =~ ^[A-Za-z0-9][A-Za-z0-9.+-]*$ ]]; then
    printf '::error::invalid Open VSX identifier or version\n' >&2
    exit 1
  fi
done
if [ ! -s "$vsix" ]; then
  printf '::error::VSIX is missing or empty: %s\n' "$vsix" >&2
  exit 1
fi
url="https://open-vsx.org/api/${namespace}/${name}/${version}/file/${namespace}.${name}-${version}.sha256"
remote=$(curl --fail --silent --show-error --location --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 10 --max-time 30 "$url")
if [[ ! "$remote" =~ ^[0-9a-f]{64}$ ]]; then
  printf '::error::Open VSX returned an invalid SHA-256 for %s\n' "$version" >&2
  exit 1
fi
local_hash=$(sha256sum -- "$vsix")
local_hash=${local_hash%% *}
if [ "$local_hash" != "$remote" ]; then
  printf '::error::Open VSX already has different VSIX bytes for %s; refusing to attest this rebuild\n' "$version" >&2
  exit 1
fi
printf 'Open VSX and %s have the same SHA-256: %s\n' "$vsix" "$local_hash"
