import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const source = resolve('vendor/sas-snippets/proc-snippets.json')
const stage = resolve('scripts/stage-sas-snippets.mjs')
const sha256 = '4627235ead83531a38b6b1fa98d5de00f0fd4509931038f8425a458addc6ae2f'

test('stages exactly the pinned upstream snippet and rejects tampering', () => {
  const root = mkdtempSync(join(tmpdir(), 'sas-snippet-'))
  try {
    const bytes = readFileSync(source)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256)
    const ok = spawnSync(process.execPath, [stage, source, root], { encoding: 'utf8' })
    assert.equal(ok.status, 0, ok.stderr)
    assert.deepEqual(readFileSync(join(root, 'snippets/proc-snippets.json')), bytes)
    const tampered = join(root, 'tampered.json')
    writeFileSync(tampered, Buffer.concat([bytes, Buffer.from(' ')]))
    const refused = spawnSync(process.execPath, [stage, tampered, root], { encoding: 'utf8' })
    assert.notEqual(refused.status, 0)
    assert.match(refused.stderr, /integrity/i)
    assert.deepEqual(readFileSync(join(root, 'snippets/proc-snippets.json')), bytes)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
