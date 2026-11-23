#!/usr/bin/env bash
# Keep the current build's provenance if it matches Open VSX. If a duplicate
# retained older bytes, recover those bytes AND their original build provenance.
set -euo pipefail
if [ "$#" -ne 5 ]; then
  printf 'usage: %s <vsix> <namespace> <extension> <version> <current-bundle>\n' "$0" >&2
  exit 1
fi
vsix=$1
namespace=${2,,}
name=$3
version=$4
bundle=$5
for part in "$namespace" "$name" "$version"; do
  [[ "$part" =~ ^[A-Za-z0-9][A-Za-z0-9.+-]*$ ]] || { echo '::error::invalid Open VSX identifier or version' >&2; exit 1; }
done
[[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo '::error::invalid event SHA' >&2; exit 1; }
[ -s "$vsix" ] && [ -s "$bundle" ] || { echo '::error::missing VSIX or provenance' >&2; exit 1; }
base="https://open-vsx.org/api/${namespace}/${name}/${version}/file/${namespace}.${name}-${version}"
curl_args=(--fail --silent --show-error --location --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 10 --max-time 30)
remote=$(curl "${curl_args[@]}" "$base.sha256")
[[ "$remote" =~ ^[0-9a-f]{64}$ ]] || { echo '::error::invalid Open VSX SHA-256' >&2; exit 1; }
local_hash=$(sha256sum -- "$vsix"); local_hash=${local_hash%% *}
if [ "$local_hash" = "$remote" ]; then
  printf 'bundle=%s\n' "$bundle" >> "$GITHUB_OUTPUT"
  echo 'Open VSX matches this build'
  exit 0
fi
# Use a temporary same-directory file and replace only after both the digest
# and provenance are verified. Never mint a build claim for downloaded bytes.
tmp=$(mktemp "${vsix}.recovery.XXXXXXXX")
verified=$(mktemp "${vsix}.verified.XXXXXXXX")
trap 'rm -f -- "$tmp" "$verified"' EXIT
curl "${curl_args[@]}" -o "$tmp" "$base.vsix"
[ -s "$tmp" ] || { echo '::error::empty marketplace VSIX' >&2; exit 1; }
download_hash=$(sha256sum -- "$tmp"); download_hash=${download_hash%% *}
[ "$download_hash" = "$remote" ] || { echo '::error::marketplace VSIX digest mismatch' >&2; exit 1; }
# The API lookup is scoped to this repository; verification restricts the
# cryptographic signer workflow and source commit, not just bundle contents.
gh attestation verify "$tmp" --repo "$GITHUB_REPOSITORY" \
  --signer-workflow "$GITHUB_REPOSITORY/.github/workflows/publish.yml" \
  --source-digest "$GITHUB_SHA" --deny-self-hosted-runners --format json > "$verified"
recovered=$(mktemp "${bundle}.recovery.XXXXXXXX")
trap 'rm -f -- "$tmp" "$verified" "$recovered"' EXIT
node -e '
const fs = require("fs");
const results = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!Array.isArray(results) || !results.length || !results[0].attestation?.bundle?.mediaType || !results[0].attestation.bundle.dsseEnvelope) throw Error("no verified provenance bundle");
fs.writeFileSync(process.argv[2], JSON.stringify(results[0].attestation.bundle) + "\n");
' "$verified" "$recovered"
mv -f -- "$recovered" "$bundle"
mv -f -- "$tmp" "$vsix"
printf 'bundle=%s\n' "$bundle" >> "$GITHUB_OUTPUT"
echo 'Recovered the marketplace VSIX and its verified original provenance'
