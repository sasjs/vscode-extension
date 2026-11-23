import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'

const script = resolve('.github/scripts/release-assets.mjs')
const hash = text => 'sha256:' + createHash('sha256').update(text).digest('hex')

test('real gh api posts raw asset bytes with the expected content type', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gh-upload-'))
  const server = createServer()
  try {
    const file = join(dir, 'test.vsix')
    writeFileSync(file, 'binary test bytes')
    const received = new Promise(resolve => server.on('request', (req, res) => {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        resolve({ method: req.method, url: req.url, type: req.headers['content-type'], body: Buffer.concat(chunks).toString() })
        res.writeHead(201, { 'Content-Type': 'application/json' }); res.end('{}')
      })
    }))
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${server.address().port}/repos/owner/repo/releases/42/assets?name=test.vsix`
    const child = spawn('gh', ['api', '--method', 'POST', '-H', 'Content-Type: application/octet-stream', '--input', file, url], { env: { ...process.env, GH_ENTERPRISE_TOKEN: 'local-test-token' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', data => { stderr += data })
    const status = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
    assert.equal(status, 0, stderr)
    assert.deepEqual(await received, { method: 'POST', url: '/repos/owner/repo/releases/42/assets?name=test.vsix', type: 'application/octet-stream', body: 'binary test bytes' })
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('uploads only absent assets and verifies exact paginated draft asset set and digests', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-assets-'))
  try {
    const vsix = join(dir, 'extension.vsix'), bundle = join(dir, 'provenance.intoto.jsonl')
    writeFileSync(vsix, 'vsix bytes'); writeFileSync(bundle, 'signed provenance')
    const state = join(dir, 'state.json'), log = join(dir, 'log')
    const gh = join(dir, 'gh')
    writeFileSync(gh, `#!${process.execPath}\n${String.raw`
const fs = require('fs'), crypto = require('crypto');
const args = process.argv.slice(2), path = process.env.STATE, s = JSON.parse(fs.readFileSync(path));
fs.appendFileSync(process.env.LOG, JSON.stringify(args) + '\n');
if (s.fail) process.exit(1);
if (args.includes('--input')) {
  const url = args.find(x => x.startsWith('https://uploads.github.com/'));
  if (!url || !url.includes('/releases/42/assets?name=')) process.exit(3);
  if (s.uploadFail) process.exit(4);
  const name = decodeURIComponent(url.split('name=')[1]), data = fs.readFileSync(args[args.indexOf('--input') + 1]);
  if (s.assets.some(a => a.name === name)) process.exit(4);
  s.assets.push({ name, state: 'uploaded', digest: 'sha256:' + crypto.createHash('sha256').update(data).digest('hex') });
  if (s.addExtraOnUpload) s.assets.push({ name: 'raced-extra', state: 'uploaded', digest: 'sha256:' + 'a'.repeat(64) });
  fs.writeFileSync(path, JSON.stringify(s));
  process.stdout.write('{}');
} else if (args.includes('PATCH')) {
  // -F (typed field), never -f: 'draft' is documented as boolean, and -f
  // would send the string "false". The flag itself is the thing under test.
  const fIndex = args.indexOf('-F');
  if (fIndex === -1 || args[fIndex + 1] !== 'draft=false' || args.includes('-f')) process.exit(6);
  if (!args.includes('repos/owner/repo/releases/42')) process.exit(6);
  process.stdout.write(JSON.stringify(s.publishResponse === null ? null : s.publishResponse || { id: 42, tag_name: 'v1.0.0', draft: false, target_commitish: 'main' }));
} else if (args.some(x => x.includes('/releases/42/assets?'))) {
  process.stdout.write(JSON.stringify(s.pages || [s.assets]));
} else if (args.some(x => x.includes('/releases?'))) {
  const releases = s.releases || [[{ id: 42, tag_name: 'v1.0.0', draft: true, target_commitish: 'a'.repeat(40) }]];
  if (s.big) releases[0][0].body = 'x'.repeat(1200000);
  process.stdout.write(JSON.stringify(releases));
} else process.exit(5);
`}`)
    chmodSync(gh, 0o755)
    const run = (mode, s) => {
      writeFileSync(state, JSON.stringify(s)); writeFileSync(log, '')
      const result = spawnSync('node', [script, mode, 'v1.0.0', 'a'.repeat(40), vsix, bundle], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: 'owner/repo', STATE: state, LOG: log } })
      return { ...result, state: JSON.parse(readFileSync(state)), log: readFileSync(log, 'utf8') }
    }
    const good = [{ name: basename(vsix), state: 'uploaded', digest: hash('vsix bytes') }, { name: basename(bundle), state: 'uploaded', digest: hash('signed provenance') }]
    let r = run('attach', { assets: good, big: true })
    assert.equal(r.status, 0, `large paginated release response must pass: ${r.stderr}`)
    r = run('attach', { assets: [] })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.state.assets.length, 2)
    assert.equal((r.log.match(/--input/g) || []).length, 2)
    r = run('attach', { assets: good })
    assert.equal(r.status, 0, r.stderr)
    assert.doesNotMatch(r.log, /--input/)
    r = run('attach', { assets: [good[0]] })
    assert.equal(r.status, 0, r.stderr)
    assert.equal((r.log.match(/--input/g) || []).length, 1)
    r = run('attach', { assets: [], uploadFail: true })
    assert.notEqual(r.status, 0, 'upload failure must fail without deleting assets')
    assert.doesNotMatch(r.log, /DELETE|--clobber/)
    r = run('attach', { assets: [], addExtraOnUpload: true })
    assert.notEqual(r.status, 0, 'post-upload readback must detect a racing extra asset')
    r = run('publish', { assets: good, pages: [[good[0]], [good[1]]] })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.log, /"-F".*"draft=false"/)
    assert.doesNotMatch(r.log, /"-f"/)
    for (const publishResponse of [
      { id: 43, tag_name: 'v1.0.0', draft: false },
      { id: 42, tag_name: 'v0.9.0', draft: false },
      { id: 42, tag_name: 'v1.0.0', draft: true },
      null
    ]) {
      r = run('publish', { assets: good, publishResponse })
      assert.notEqual(r.status, 0, `publication response identity mismatch must fail: ${JSON.stringify(publishResponse)}`)
    }
    r = run('publish', { assets: [good[0]] })
    assert.notEqual(r.status, 0)
    assert.doesNotMatch(r.log, /"PATCH"/)
    for (const bad of [
      { assets: [] }, { assets: [good[0]] }, { assets: [...good, { name: 'unexpected', state: 'uploaded', digest: hash('x') }] },
      { assets: [good[0], { ...good[1], digest: hash('wrong') }] }, { assets: [good[0], { ...good[1], digest: null }] },
      { assets: [good[0], { ...good[1], state: 'starter' }] }, { assets: [good[0], good[0], good[1]] },
      { assets: good, pages: [good, [{ name: 'hidden-extra', state: 'uploaded', digest: hash('x') }]] },
      { assets: good, pages: { malformed: true } }, { assets: good, fail: true },
      { assets: good, releases: [[{ id: 42, tag_name: 'v1.0.0', draft: false, target_commitish: 'a'.repeat(40) }]] },
      { assets: good, releases: [[{ id: 42, tag_name: 'v1.0.0', draft: true, target_commitish: 'b'.repeat(40) }]] },
      { assets: good, releases: [[]] }
    ]) {
      r = run('publish', bad)
      assert.notEqual(r.status, 0, `must refuse ${JSON.stringify(bad)}`)
      assert.doesNotMatch(r.log, /"PATCH"/, 'must not publish on a bad draft or asset state')
    }
    for (const bad of [{ assets: [good[0], { ...good[1], digest: hash('wrong') }] }, { assets: [{ name: 'extra' }] }]) {
      r = run('attach', bad)
      assert.notEqual(r.status, 0)
      assert.doesNotMatch(r.log, /--input/, 'must not upload or delete on conflict')
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
