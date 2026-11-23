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
# Verify the actual bundle to be attached, not merely the marketplace hash.
# This limits substitution; it does not isolate signing credentials from
# other code in the job, which remains an open trust-boundary finding.
verify_bundle() {
  local result
  result=$(mktemp "${vsix}.bundle-verify.XXXXXXXX")
  if ! gh attestation verify "$1" --bundle "$2" --repo "$GITHUB_REPOSITORY" \
    --signer-workflow "$GITHUB_REPOSITORY/.github/workflows/publish.yml" \
    --source-digest "$GITHUB_SHA" --source-ref refs/heads/main --deny-self-hosted-runners \
    --predicate-type https://slsa.dev/provenance/v1 --format json > "$result"; then
    rm -f -- "$result"
    return 1
  fi
  if ! node -e '
const fs = require("fs"), { isDeepStrictEqual } = require("util");
const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
// gh parses and may normalize bundle metadata on output. Bind its verified
// result to the exact DSSE envelope in the single input object, not the
// serialization of unsigned verification metadata.
if (!Array.isArray(r) || r.length !== 1 || !input.dsseEnvelope || !isDeepStrictEqual(input.dsseEnvelope, r[0].attestation?.bundle?.dsseEnvelope)) throw Error("expected one verified envelope matching the file");
' "$result" "$2"; then
    rm -f -- "$result"
    return 1
  fi
  rm -f -- "$result"
}
if [ "$local_hash" = "$remote" ]; then
  verify_bundle "$vsix" "$bundle"
  printf 'bundle=%s\n' "$bundle" >> "$GITHUB_OUTPUT"
  echo 'Open VSX matches this build and its bundle verifies'
  exit 0
fi
# Use a temporary same-directory file and replace only after both the digest
# and provenance are verified. Never mint a build claim for downloaded bytes.
tmp=$(mktemp "${vsix}.recovery.XXXXXXXX")
verified=$(mktemp "${vsix}.verified.XXXXXXXX")
trap 'rm -f -- "$tmp" "$verified"' EXIT
curl "${curl_args[@]}" --max-time 600 -o "$tmp" "$base.vsix"
[ -s "$tmp" ] || { echo '::error::empty marketplace VSIX' >&2; exit 1; }
download_hash=$(sha256sum -- "$tmp"); download_hash=${download_hash%% *}
[ "$download_hash" = "$remote" ] || { echo '::error::marketplace VSIX digest mismatch' >&2; exit 1; }
# The API lookup is scoped to this repository; verification restricts the
# cryptographic signer workflow and source commit, not just bundle contents.
gh attestation verify "$tmp" --repo "$GITHUB_REPOSITORY" \
  --signer-workflow "$GITHUB_REPOSITORY/.github/workflows/publish.yml" \
  --source-digest "$GITHUB_SHA" --source-ref refs/heads/main --deny-self-hosted-runners \
  --predicate-type https://slsa.dev/provenance/v1 --format json > "$verified"
# The API can return distinct valid attestations for the same artifact. Identical
# verified results can be deduplicated; distinct bundles require manual resolution.
# The lookup is limited by gh, so uniqueness beyond the returned set is unknown.
# Stage the bundle in a private directory with the original asset name. The
# original bundle never changes; the single artifact rename is the commit point.
recovery_dir=$(mktemp -d "${vsix}.provenance.XXXXXXXX")
recovered="$recovery_dir/$(basename -- "$bundle")"
trap 'rm -f -- "$tmp" "$verified"; [ -z "${recovery_dir:-}" ] || rm -rf -- "$recovery_dir"' EXIT
node -e '
const fs = require("fs"), { isDeepStrictEqual } = require("util");
const results = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!Array.isArray(results) || !results.length || results.some(r => !r.attestation?.bundle?.mediaType || !r.attestation.bundle.dsseEnvelope) || results.some(r => !isDeepStrictEqual(r.attestation.bundle, results[0].attestation.bundle))) throw Error("expected one distinct verified provenance bundle; resolve manually");
fs.writeFileSync(process.argv[2], JSON.stringify(results[0].attestation.bundle) + "\n");
' "$verified" "$recovered"
# Re-verify the precise extracted bytes before installing either recovered file.
verify_bundle "$tmp" "$recovered"
# The output is written first, and only used by subsequent steps on success.
# If either this write or the rename fails, the original files remain intact.
printf 'bundle=%s\n' "$recovered" >> "$GITHUB_OUTPUT"
echo 'Installing the verified marketplace VSIX and original provenance'
mv -f -- "$tmp" "$vsix"
# Keep the staged bundle for the subsequent attachment step.
recovery_dir=
