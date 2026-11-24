import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { selectBundle } from './select-attestation-bundle.mjs'

const bundle = { dsseEnvelope: { payload: 'e30=', signatures: [] } }
const wrapped = value => [{ attestation: { bundle: value } }]

test('one verified attestation is reused as a single JSONL line', () => {
  assert.equal(selectBundle(wrapped(bundle)), JSON.stringify(bundle))
  assert.equal(selectBundle([{ bundle }]), JSON.stringify(bundle))
  // gh can return the bundle as a JSON string; the file format is the same.
  assert.equal(selectBundle(wrapped(JSON.stringify(bundle))), JSON.stringify(bundle))
})

test('identical duplicates are one attestation, not a choice', () => {
  assert.equal(selectBundle([{ attestation: { bundle } }, { attestation: { bundle: JSON.stringify(bundle) } }]), JSON.stringify(bundle))
  // Key order is not part of the meaning: the same bundle spelled differently is
  // still one attestation.
  const reordered = { dsseEnvelope: { signatures: [], payload: 'e30=' } }
  assert.equal(selectBundle([{ attestation: { bundle } }, { attestation: { bundle: reordered } }]), selectBundle([{ attestation: { bundle } }]))
})

test('an object that is not an attestation bundle is refused', () => {
  assert.throws(() => selectBundle([{ attestation: { bundle: {} } }]), /no dsseEnvelope/)
  assert.throws(() => selectBundle([{ attestation: { bundle: { dsseEnvelope: [] } } }]), /no dsseEnvelope/)
})

test('distinct verified bundles fail closed rather than picking by response order', () => {
  const other = { dsseEnvelope: { payload: 'e31=', signatures: [] } }
  assert.throws(() => selectBundle([{ attestation: { bundle } }, { attestation: { bundle: other } }]), /2 distinct verified attestations.*resolve manually/)
})

test('no attestation, a missing bundle or malformed output all fail closed', () => {
  assert.throws(() => selectBundle([]), /no verified attestation.*resolve manually/)
  assert.throws(() => selectBundle({ attestations: [] }), /no verified attestation/)
  assert.throws(() => selectBundle([{ attestation: {} }]), /carries no bundle/)
  assert.throws(() => selectBundle([{ attestation: { bundle: 'not json' } }]), /not JSON/)
  assert.throws(() => selectBundle([{ attestation: { bundle: '[]' } }]), /not a JSON object/)
  assert.throws(() => selectBundle('nope'), /not a list of attestations/)
  assert.throws(() => selectBundle(null), /not a list of attestations/)
})

test('the CLI writes the bundle and reports what it reused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vsix-select-'))
  try {
    const input = join(dir, 'attestations.json')
    const output = join(dir, 'provenance-3.3.0.intoto.jsonl')
    writeFileSync(input, JSON.stringify(wrapped(bundle)))
    let r = spawnSync('node', ['.github/scripts/select-attestation-bundle.mjs', input, output], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(readFileSync(output, 'utf8'), `${JSON.stringify(bundle)}\n`)
    assert.match(r.stdout, /reusing the recorded attestation/)

    writeFileSync(input, JSON.stringify([]))
    r = spawnSync('node', ['.github/scripts/select-attestation-bundle.mjs', input, output], { encoding: 'utf8' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /::error::no verified attestation/)

    // Invoked through a symlink, main() must still run: a script that exits 0
    // having written nothing is indistinguishable from success to the workflow.
    const link = join(dir, 'selector.mjs')
    symlinkSync(resolve('.github/scripts/select-attestation-bundle.mjs'), link)
    writeFileSync(input, JSON.stringify(wrapped(bundle)))
    writeFileSync(output, '')
    r = spawnSync('node', [link, input, output], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /reusing the recorded attestation/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
