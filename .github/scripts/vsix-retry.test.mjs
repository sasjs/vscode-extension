import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const script = resolve('.github/scripts/recover-open-vsx.sh')
test('retry recovers the exact marketplace VSIX and its original verified provenance', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vsix-retry-test-'))
  try {
    const artifact = join(dir, 'extension.vsix')
    const bundle = join(dir, 'current.intoto.jsonl')
    const output = join(dir, 'output')
    const log = join(dir, 'log')
    const curlLog = join(dir, 'curl-log')
    const marketplace = 'original published bytes'
    const digest = spawnSync('sha256sum', [], { input: marketplace, encoding: 'utf8' }).stdout.slice(0, 64)
    const validBundle = { mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.3', dsseEnvelope: { payload: 'b3JpZ2luYWw=' } }
    const inputBundle = JSON.stringify(validBundle) + '\n'
    const oldBundle = JSON.stringify({ ...validBundle, dsseEnvelope: { payload: 'YnVpbGQ=' } }) + '\n'
    writeFileSync(bundle, inputBundle)
    writeFileSync(join(dir, 'curl'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "$MOCK_CURL_LOG"\n[ "$MOCK_CURL_FAIL" != 1 ] || exit 22\ncase "\${*: -1}" in *.sha256) printf '%s' "$MOCK_HASH";; *.vsix) while [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then shift; printf '%s' "$MOCK_BYTES" > "$1"; exit 0; fi; shift; done; exit 2;; *) exit 3;; esac\n`)
    writeFileSync(join(dir, 'gh'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "$MOCK_LOG"\n[ "$MOCK_VERIFY_FAIL" != 1 ] || exit 1\nif [[ " $* " == *' --bundle '* ]]; then [ "\${MOCK_BUNDLE_FAIL:-}" != 1 ] || exit 1; if [ -n "$MOCK_BUNDLE_VERIFIED" ]; then printf '%s' "$MOCK_BUNDLE_VERIFIED"; exit; fi; fi\nprintf '%s' "$MOCK_VERIFIED"\n`)
    writeFileSync(join(dir, 'mv'), `#!/bin/bash\nif [ "\${MOCK_MV_FAIL:-}" = 1 ] && [[ "\${*: -1}" == *.vsix ]]; then exit 1; fi\nexec /usr/bin/mv "$@"\n`)
    chmodSync(join(dir, 'curl'), 0o755); chmodSync(join(dir, 'gh'), 0o755); chmodSync(join(dir, 'mv'), 0o755)
    const run = (bytes, overrides = {}) => {
      writeFileSync(artifact, bytes); writeFileSync(output, ''); writeFileSync(log, ''); writeFileSync(curlLog, ''); writeFileSync(bundle, bytes === marketplace ? inputBundle : oldBundle)
      const result = spawnSync('bash', [script, artifact, 'sasjs', 'sasjs-for-vscode', '3.3.0', bundle], {
        encoding: 'utf8', cwd: dir, env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, MOCK_HASH: digest, MOCK_BYTES: marketplace, MOCK_LOG: log, MOCK_CURL_LOG: curlLog, MOCK_VERIFIED: JSON.stringify([{ attestation: { bundle: { mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.3', dsseEnvelope: { payload: 'b3JpZ2luYWw=' } } } }]), GITHUB_OUTPUT: output, GITHUB_REPOSITORY: 'sasjs/vscode-extension', GITHUB_SHA: 'a'.repeat(40), ...overrides }
      })
      return { ...result, output: readFileSync(output, 'utf8'), artifact: readFileSync(artifact, 'utf8'), log: readFileSync(log, 'utf8') }
    }
    let result = run(marketplace)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.artifact, marketplace)
    assert.match(result.output, new RegExp(`bundle=${bundle}`))
    const matchingArgs = result.log.trim().split('\n')
    assert.equal(matchingArgs.length, 1)
    assert.equal(matchingArgs[0], `attestation verify ${artifact} --bundle ${bundle} --repo sasjs/vscode-extension --signer-workflow sasjs/vscode-extension/.github/workflows/publish.yml --source-digest ${'a'.repeat(40)} --source-ref refs/heads/main --deny-self-hosted-runners --predicate-type https://slsa.dev/provenance/v1 --format json`, 'verify exact matching artifact, bundle and policy')
    result = run(marketplace, { MOCK_BUNDLE_VERIFIED: JSON.stringify([{ attestation: { bundle: { ...validBundle, dsseEnvelope: { payload: 'dGFtcGVyZWQ=' } } } }]) })
    assert.notEqual(result.status, 0, 'verified result must represent the actual bundle bytes')
    assert.doesNotMatch(result.output, /^bundle=/m)
    result = run(marketplace, { MOCK_BUNDLE_VERIFIED: JSON.stringify([{ attestation: { bundle: { ...validBundle, verificationMaterial: { tlogEntries: [] } } } }]) })
    assert.equal(result.status, 0, 'gh may normalize a verified single-bundle input in JSON output')
    result = run(marketplace, { MOCK_VERIFY_FAIL: '1' })
    assert.notEqual(result.status, 0, 'matching bytes must not permit an invalid provenance bundle')
    assert.doesNotMatch(result.output, /^bundle=/m)
    for (const MOCK_VERIFIED of ['[]', 'not json', JSON.stringify([{}, {}])]) {
      result = run(marketplace, { MOCK_VERIFIED })
      assert.notEqual(result.status, 0, 'matching bytes must reject invalid or ambiguous verification results')
      assert.doesNotMatch(result.output, /^bundle=/m)
    }
    result = run('different rebuilt bytes')
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.artifact, marketplace)
    assert.match(readFileSync(curlLog, 'utf8'), /--max-time 600 .*\.vsix/m, 'large recovery download needs a realistic timeout')
    assert.match(result.output, /^bundle=.*\.intoto\.jsonl$/m)
    const recoveredBundle = result.output.match(/^bundle=(.*)$/m)[1]
    assert.notEqual(recoveredBundle, bundle, 'recovery must preserve the original bundle')
    assert.equal(readFileSync(bundle, 'utf8'), oldBundle)
    assert.deepEqual(JSON.parse(readFileSync(recoveredBundle, 'utf8')), { mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.3', dsseEnvelope: { payload: 'b3JpZ2luYWw=' } })
    assert.match(result.log, /attestation verify/)
    assert.match(result.log, /--source-digest a{40}/)
    assert.equal(result.log.trim().split('\n').filter(line => line.includes('--source-ref refs/heads/main')).length, 2, 'lookup and extracted bundle verification require main')
    assert.match(result.log, /--signer-workflow sasjs\/vscode-extension\/\.github\/workflows\/publish\.yml/)
    assert.match(result.log, /--repo sasjs\/vscode-extension/)
    assert.match(result.log, /--deny-self-hosted-runners/)
    assert.match(result.log, /--predicate-type https:\/\/slsa.dev\/provenance\/v1/)
    assert.match(result.log, /--bundle /, 'the extracted recovery bundle is verified again before use')
    result = run('different rebuilt bytes', { MOCK_BUNDLE_FAIL: '1' })
    assert.notEqual(result.status, 0, 'failed extracted bundle verification aborts before installation')
    assert.equal(result.artifact, 'different rebuilt bytes')
    assert.equal(readFileSync(bundle, 'utf8'), oldBundle)
    assert.doesNotMatch(result.output, /^bundle=/m)
    result = run('different rebuilt bytes', { MOCK_MV_FAIL: '1' })
    assert.notEqual(result.status, 0, 'a failed artifact rename must abort recovery')
    assert.equal(result.artifact, 'different rebuilt bytes', 'a failed rename preserves the original artifact')
    assert.equal(readFileSync(bundle, 'utf8'), oldBundle, 'a failed rename preserves the original bundle')
    result = run('different rebuilt bytes', { MOCK_BYTES: 'wrong download' })
    assert.notEqual(result.status, 0, 'wrong download must fail')
    assert.equal(result.artifact, 'different rebuilt bytes', 'failed recovery cannot replace build')
    result = run('different rebuilt bytes', { MOCK_VERIFY_FAIL: '1' })
    assert.notEqual(result.status, 0, 'untrusted provenance must fail')
    assert.equal(result.artifact, 'different rebuilt bytes')
    const first = { attestation: { bundle: { mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.3', dsseEnvelope: { payload: 'Zmlyc3Q=' } } } }
    const second = { attestation: { bundle: { mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.3', dsseEnvelope: { payload: 'c2Vjb25k' } } } }
    result = run('different rebuilt bytes', { MOCK_VERIFIED: JSON.stringify([first, first]), MOCK_BUNDLE_VERIFIED: JSON.stringify([first]) })
    assert.equal(result.status, 0, 'duplicate verified identical bundles are not ambiguous')
    for (const candidates of [[first, second], [second, first]]) {
      result = run('different rebuilt bytes', { MOCK_VERIFIED: JSON.stringify(candidates), MOCK_BUNDLE_VERIFIED: JSON.stringify([candidates[0]]) })
      assert.notEqual(result.status, 0, 'multiple verified bundles must fail regardless of order')
      assert.equal(result.artifact, 'different rebuilt bytes')
      assert.equal(readFileSync(bundle, 'utf8'), oldBundle, 'failure must not replace the bundle')
      assert.doesNotMatch(result.output, /^bundle=/m)
    }
    result = run('different rebuilt bytes', { MOCK_VERIFIED: '[]' })
    assert.notEqual(result.status, 0, 'missing original provenance must fail')
    result = run('different rebuilt bytes', { MOCK_HASH: 'malformed' })
    assert.notEqual(result.status, 0, 'malformed hash must fail')
    result = run('different rebuilt bytes', { MOCK_CURL_FAIL: '1' })
    assert.notEqual(result.status, 0, 'unavailable marketplace must fail')
    assert.equal(result.artifact, 'different rebuilt bytes')
    result = run('different rebuilt bytes', { MOCK_VERIFIED: 'not json' })
    assert.notEqual(result.status, 0, 'malformed verified output must fail')
    assert.equal(result.artifact, 'different rebuilt bytes')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('workflow attests its build before publication and attaches the selected provenance', () => {
  const workflow = readFileSync('.github/workflows/publish.yml', 'utf8')
  const order = ['Attest the VSIX', 'Publish to Open VSX', 'Verify the Open VSX artifact', 'Attach the .vsix and provenance to the release'].map(name => workflow.indexOf(`      - name: ${name}\n`))
  assert.ok(order.every(i => i >= 0))
  assert.deepEqual(order, [...order].sort((a, b) => a - b))
  assert.match(workflow, /run: bash \.github\/scripts\/recover-open-vsx\.sh/)
  assert.match(workflow, /\$\{\{ steps\.verify\.outputs\.bundle \}\}/)
})
