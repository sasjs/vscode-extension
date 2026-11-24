import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const script = resolve('.github/scripts/verify-open-vsx.sh')
test('marketplace digest gate fails closed without replacing the build or attaching anything', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vsix-gate-'))
  try {
    const artifact = join(dir, 'extension.vsix'), bundle = join(dir, 'bundle.intoto.jsonl'), log = join(dir, 'log')
    writeFileSync(artifact, 'built bytes')
    writeFileSync(bundle, 'bundle')
    writeFileSync(join(dir, 'curl'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$LOG"\n[ "$FAIL" != 1 ] || exit 22\nprintf "%s" "$HASH"\n')
    chmodSync(join(dir, 'curl'), 0o755)
    writeFileSync(join(dir, 'gh'), '#!/bin/sh\nprintf "gh %s\\n" "$*" >> "$LOG"\n[ "$VERIFY_FAIL" != 1 ]\n')
    chmodSync(join(dir, 'gh'), 0o755)
    const digest = createHash('sha256').update('built bytes').digest('hex')
    for (const [hash, fail, expected] of [[digest, '0', 0], ['a'.repeat(64), '0', 1], ['malformed', '0', 1], [digest, '1', 1]]) {
      writeFileSync(log, '')
      const r = spawnSync('bash', [script, artifact, 'sasjs', 'sasjs-for-vscode', '3.3.0', bundle], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, LOG: log, HASH: hash, FAIL: fail, GITHUB_SHA: 'a'.repeat(40), GITHUB_REPOSITORY: 'sasjs/vscode-extension' } })
      assert.equal(r.status, expected, r.stderr)
      assert.equal(readFileSync(artifact, 'utf8'), 'built bytes')
      assert.match(readFileSync(log, 'utf8'), /sasjs\.sasjs-for-vscode-3\.3\.0\.sha256/)
      if (expected) assert.doesNotMatch(readFileSync(log, 'utf8'), /^gh /m)
      else assert.match(readFileSync(log, 'utf8'), /gh attestation verify .*--bundle .*--source-digest a{40}/)
      if (expected) assert.match(r.stderr, /manual/i)
    }
    const badBundle = spawnSync('bash', [script, artifact, 'sasjs', 'sasjs-for-vscode', '3.3.0', bundle], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, LOG: log, HASH: digest, FAIL: '0', VERIFY_FAIL: '1', GITHUB_SHA: 'a'.repeat(40), GITHUB_REPOSITORY: 'sasjs/vscode-extension' } })
    assert.notEqual(badBundle.status, 0)
    assert.match(badBundle.stderr, /manual/i)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('workflow packages, attests, publishes, gates, attaches and publishes the release in order', () => {
  const workflow = readFileSync('.github/workflows/publish.yml', 'utf8')
  const names = ['Decide what to package', 'Package the extension', 'Digest the packaged extension', 'Attest the VSIX', 'Verify the Open VSX artifact', 'Attach the .vsix and provenance to the release', 'Publish the release']
  const positions = names.map(name => workflow.indexOf(`      - name: ${name}\n`))
  assert.ok(positions.every(i => i >= 0))
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
  assert.match(workflow, /run: bash \.github\/scripts\/verify-open-vsx\.sh/)
  assert.doesNotMatch(workflow, /recover-open-vsx|steps\.verify\.outputs\.bundle/)
  // The bundle is named from the version, so both the signed and the reused path
  // produce the file the later steps verify and attach.
  assert.match(workflow, /BUNDLE: dist\/provenance-\$\{\{ needs\.build\.outputs\.version \}\}\.intoto\.jsonl/)
  assert.match(workflow, /vsix:publish --silent -- "\$VSIX" --skip-duplicate/)
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/)
  assert.match(workflow, /sasjs\/release\/\.github\/actions\/attest-assets@[0-9a-f]{40}/)
  // The version is stamped in the job that packages, from the tag the release job
  // resolved - not carried in a mutable intermediate.
  assert.match(workflow, /run: npm run release -- --prepare-publish --branch main --no-registry-lookup --tag "\$TAG" --output "\$GITHUB_OUTPUT"/)
  assert.match(workflow, /TAG: \$\{\{ needs\.release\.outputs\.tag \}\}/)
  assert.match(workflow, /VSIX="\$\(node -p 'require\("\.\/package\.json"\)\.name'\)-\$\{VERSION\}\.vsix"/)
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
  assert.equal(pkg.devDependencies['@sasjs/release'], '0.19.1')
  assert.equal(lock.packages[''].devDependencies['@sasjs/release'], '0.19.1')
})

test('a mismatch stops the workflow before GitHub attachment or release publication', () => {
  const workflow = readFileSync('.github/workflows/publish.yml', 'utf8')
  const dir = mkdtempSync(join(tmpdir(), 'vsix-pipeline-'))
  try {
    const log = join(dir, 'log'), artifact = join(dir, 'extension.vsix'), bundle = join(dir, 'bundle.intoto.jsonl')
    writeFileSync(log, ''); writeFileSync(artifact, 'built'); writeFileSync(bundle, 'bundle')
    writeFileSync(join(dir, 'curl'), '#!/bin/sh\nprintf "%064d" 0\n')
    writeFileSync(join(dir, 'node'), '#!/bin/sh\nprintf "node %s\\n" "$*" >> "$LOG"\n')
    writeFileSync(join(dir, 'npm'), '#!/bin/sh\nprintf "npm %s\\n" "$*" >> "$LOG"\n')
    writeFileSync(join(dir, 'gh'), '#!/bin/sh\nprintf "gh %s\\n" "$*" >> "$LOG"\n[ "$VERIFY_FAIL" != 1 ]\n')
    for (const cmd of ['curl', 'node', 'npm', 'gh']) chmodSync(join(dir, cmd), 0o755)
    const step = name => {
      const block = workflow.split(`      - name: ${name}\n`)[1]?.split(/\n      - (?:name:|uses:|run:)/)[0]
      const line = block.match(/^        run: (.+)$/m)[1]
      return line === '|' ? block.match(/^        run: \|\n((?:          .*\n|\n)+)/m)[1].replace(/^          /gm, '') : line
    }
    const chain = ['Verify build provenance before publishing', 'Publish to Open VSX', 'Verify the Open VSX artifact', 'Attach the .vsix and provenance to the release', 'Publish the release'].map(step).join('\n')
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, LOG: log, VSIX: artifact, BUNDLE: bundle, VERSION: '3.3.0', TAG: 'v3.3.0', EVENT_SHA: 'a'.repeat(40), GITHUB_SHA: 'a'.repeat(40), GITHUB_REPOSITORY: 'sasjs/vscode-extension', OVSX_PAT: 'test' }
    let r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', chain], { cwd: process.cwd(), encoding: 'utf8', env: { ...env, VERIFY_FAIL: '1' } })
    assert.notEqual(r.status, 0)
    assert.doesNotMatch(readFileSync(log, 'utf8'), /npm|release-assets/)
    // An empty bundle is a file, so it has to be refused before anything is published.
    writeFileSync(log, '')
    writeFileSync(bundle, '')
    r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', chain], { cwd: process.cwd(), encoding: 'utf8', env })
    assert.notEqual(r.status, 0)
    assert.match(r.stdout + r.stderr, /no provenance bundle/)
    assert.doesNotMatch(readFileSync(log, 'utf8'), /npm|release-assets/)
    writeFileSync(bundle, 'bundle')
    writeFileSync(log, '')
    r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', chain], { cwd: process.cwd(), encoding: 'utf8', env })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /checksum.*manual/i)
    const calls = readFileSync(log, 'utf8')
    assert.match(calls, /npm run vsix:publish.*--skip-duplicate/)
    assert.doesNotMatch(calls, /release-assets\.mjs (?:attach|publish)/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('package step rejects a prepared version that differs from the release tag', () => {
  const workflow = readFileSync('.github/workflows/publish.yml', 'utf8')
  const block = workflow.split('      - name: Package the extension\n')[1].split(/\n      - (?:name:|uses:|run:)/)[0]
  const shell = block.match(/^        run: \|\n((?:          .*\n|\n)+)/m)[1].replace(/^          /gm, '')
  const dir = mkdtempSync(join(tmpdir(), 'vsix-version-'))
  try {
    const log = join(dir, 'log'); writeFileSync(log, '')
    for (const cmd of ['git', 'node', 'npm']) { writeFileSync(join(dir, cmd), `#!/bin/sh\nprintf '${cmd}\\n' >> "$LOG"\n`); chmodSync(join(dir, cmd), 0o755) }
    const r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', shell], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, LOG: log, TAG: 'v1.2.3', VERSION: '1.2.4', GITHUB_OUTPUT: join(dir, 'output') } })
    assert.notEqual(r.status, 0)
    assert.doesNotMatch(readFileSync(log, 'utf8'), /npm/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
