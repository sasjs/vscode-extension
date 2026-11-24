import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { evaluate, SIGN, REUSE } from './vsix-bind.mjs'

const digest = createHash('sha256').update('dnVsbA==').digest('hex')
const sha = 'a'.repeat(40)
const base = {
  artifact: null,
  artifactId: '42',
  expectedDigest: digest,
  actualDigest: digest,
  runId: '1000',
  runAttempt: 1,
  sha
}
const artifact = (over = {}) => ({
  id: 42,
  expired: false,
  digest: `sha256:${digest}`,
  workflow_run: { id: 1000, head_sha: sha },
  ...over
})

base.artifact = artifact()

test('a first attempt signs the artifact its own build job uploaded', () => {
  assert.deepEqual(evaluate({ artifact: artifact(), ...base }), { mode: SIGN, problems: [] })
})

test('a re-run never signs, because the artifact may be an inherited attempt', () => {
  assert.deepEqual(evaluate({ artifact: artifact(), ...base, runAttempt: 2 }), { mode: REUSE, problems: [] })
  // Inherited build outputs can be another attempt's, so they are not compared.
  assert.deepEqual(evaluate({ artifact: artifact(), ...base, runAttempt: 2, expectedDigest: 'b'.repeat(64) }), { mode: REUSE, problems: [] })
})

const refused = (name, mutate, expected) => {
  test(`refuses ${name}`, () => {
    const { mode, problems } = evaluate(mutate(base))
    assert.equal(mode, null)
    assert.ok(problems.some(p => expected.test(p)), `no problem matched ${expected}: ${JSON.stringify(problems)}`)
  })
}

refused('a different artifact id', input => ({ ...input, artifact: artifact({ id: 43 }) }), /artifact id/)
refused('an expired artifact', input => ({ ...input, artifact: artifact({ expired: true }) }), /expired/)
refused('an artifact from another run', input => ({ ...input, artifact: artifact({ workflow_run: { id: 999, head_sha: sha } }) }), /workflow_run\.id/)
refused('an artifact from another commit', input => ({ ...input, artifact: artifact({ workflow_run: { id: 1000, head_sha: 'b'.repeat(40) } }) }), /workflow_run\.head_sha/)
refused('a digest the artifact API does not report', input => ({ ...input, artifact: artifact({ digest: `sha256:${'c'.repeat(64)}` }) }), /artifact digest/)
refused('an artifact with no digest', input => ({ ...input, artifact: artifact({ digest: null }) }), /artifact digest/)
refused('a malformed artifact digest', input => ({ ...input, artifact: artifact({ digest: 'sha256:abc' }) }), /artifact digest/)
refused('an artifact with no workflow_run', input => ({ ...input, artifact: artifact({ workflow_run: undefined }) }), /workflow_run/)
refused('bytes that differ from the build job report', input => ({ ...input, actualDigest: 'd'.repeat(64), artifact: artifact({ digest: `sha256:${'d'.repeat(64)}` }) }), /build job digest/)
refused('a build job that reported no digest', input => ({ ...input, expectedDigest: '' }), /build job did not report/)
refused('a malformed downloaded digest', input => ({ ...input, actualDigest: 'nothex', artifact: artifact({ digest: `sha256:nothex` }) }), /not a sha256/)
refused('a non-object artifact response', input => ({ ...input, artifact: [artifact()] }), /not a JSON object/)
refused('an attempt that is not a number', input => ({ ...input, runAttempt: 0 }), /run attempt/)

test('the CLI writes the decision to GITHUB_OUTPUT and fails closed on a mismatch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vsix-bind-'))
  try {
    const vsix = join(dir, 'extension.vsix')
    const metadata = join(dir, 'artifact.json')
    const output = join(dir, 'output')
    writeFileSync(vsix, 'dnVsbA==')
    writeFileSync(metadata, JSON.stringify(artifact()))
    writeFileSync(output, '')
    const env = {
      ...process.env,
      GITHUB_OUTPUT: output,
      GITHUB_RUN_ID: '1000',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_SHA: sha,
      ARTIFACT_ID: '42',
      EXPECTED_DIGEST: digest
    }
    let r = spawnSync('node', ['.github/scripts/vsix-bind.mjs', metadata, vsix], { encoding: 'utf8', env })
    assert.equal(r.status, 0, r.stderr)
    // stdout carries a human-readable line, so the decision must be written to the
    // file rather than piped there.
    assert.equal(readFileSync(output, 'utf8'), `mode=${SIGN}\n`)
    assert.match(r.stdout, /bound .* attempt 1: sign/)

    writeFileSync(output, '')
    r = spawnSync('node', ['.github/scripts/vsix-bind.mjs', metadata, vsix], { encoding: 'utf8', env: { ...env, GITHUB_RUN_ATTEMPT: '2' } })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(readFileSync(output, 'utf8'), `mode=${REUSE}\n`)
    assert.match(r.stdout, /::warning::this attempt rebuilt the VSIX/)

    writeFileSync(output, '')
    writeFileSync(vsix, 'other bytes')
    r = spawnSync('node', ['.github/scripts/vsix-bind.mjs', metadata, vsix], { encoding: 'utf8', env })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /::error::artifact digest/)
    assert.match(r.stderr, /will not be attested/)
    assert.equal(readFileSync(output, 'utf8'), '')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
