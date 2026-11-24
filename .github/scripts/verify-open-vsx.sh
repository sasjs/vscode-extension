#!/usr/bin/env bash
# Never substitute marketplace bytes or mint provenance for a different build.
set -euo pipefail
fail() { echo "::error::$*; resolve manually" >&2; exit 1; }
[ "$#" -eq 5 ] || fail 'expected VSIX, namespace, extension, version and bundle'
vsix=$1; namespace=${2,,}; name=$3; version=$4; bundle=$5
for part in "$namespace" "$name" "$version"; do
  [[ "$part" =~ ^[A-Za-z0-9][A-Za-z0-9.+-]*$ ]] || fail 'invalid Open VSX identifier or version'
done
[[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail 'invalid event SHA'
[ -s "$vsix" ] && [ -s "$bundle" ] || fail 'missing VSIX or provenance bundle'
url="https://open-vsx.org/api/${namespace}/${name}/${version}/file/${namespace}.${name}-${version}.sha256"
remote=$(curl --fail --silent --show-error --location --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 10 --max-time 30 "$url") || fail 'Open VSX checksum unavailable'
[[ "$remote" =~ ^[0-9a-f]{64}$ ]] || fail 'malformed Open VSX SHA-256'
local_hash=$(sha256sum -- "$vsix"); local_hash=${local_hash%% *}
[ "$local_hash" = "$remote" ] || fail 'Open VSX checksum does not match the built VSIX'
# Verify the actual bundle against the exact artifact and workflow identity.
gh attestation verify "$vsix" --bundle "$bundle" --repo "$GITHUB_REPOSITORY" \
  --signer-workflow "$GITHUB_REPOSITORY/.github/workflows/publish.yml" \
  --source-digest "$GITHUB_SHA" --source-ref refs/heads/main --deny-self-hosted-runners \
  --predicate-type https://slsa.dev/provenance/v1 || fail 'provenance verification failed'
echo 'Open VSX checksum and build provenance verified'
