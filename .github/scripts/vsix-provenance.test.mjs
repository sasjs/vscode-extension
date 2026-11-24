import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'

const workflow = readFileSync('.github/workflows/publish.yml', 'utf8').replace(/\r\n/g, '\n')
const steps = [...workflow.matchAll(/^      - name: (.+)\n([\s\S]*?)(?=^      - (?:name:|uses:|run:)|(?![\s\S]))/gm)]
const named = name => {
  const found = steps.filter(step => step[1] === name)
  assert.equal(found.length, 1, `expected one ${name} step`)
  return found[0][2]
}

// The jobs block, so a permission asserted here cannot be satisfied by a
// different job's grant.
const jobsText = workflow.slice(workflow.indexOf('\njobs:\n') + 1)
const jobBody = name => {
  const parts = jobsText.split(/\n(?=  [a-z][a-z-]*:\n)/)
  const found = parts.filter(part => part.startsWith(`  ${name}:\n`))
  assert.equal(found.length, 1, `expected one ${name} job`)
  return found[0]
}

test('the extension is published from a job that holds the marketplace token and no identity', () => {
  const sign = jobBody('sign')
  const publish = jobBody('publish')
  const build = jobBody('build')
  const release = jobBody('release')

  // One identity in the workflow, and it is not beside a secret or a build tool.
  assert.equal((workflow.match(/^      id-token: write\b/gm) || []).length, 1)
  assert.equal((workflow.match(/^      attestations: write\b/gm) || []).length, 1)
  for (const body of [release, build, publish]) {
    assert.doesNotMatch(body, /^      id-token:/m)
    assert.doesNotMatch(body, /^      attestations: write/m)
  }
  assert.match(sign, /^      id-token: write\b/m)
  assert.match(sign, /^      attestations: write\b/m)
  assert.match(sign, /^      contents: read\b/m)
  // No third-party tooling, and no secret, where an attestation can be minted.
  const signCode = sign.split('\n').filter(line => !line.trim().startsWith('#')).join('\n')
  assert.doesNotMatch(signCode, /\bnpm\b|\bnpx\b|\bovsx\b|\bvsce\b|\bdegit\b/)
  assert.doesNotMatch(signCode, /secrets\./)
  // The artifact API read in the bind step needs this, and dropping it fails the
  // release at the last gate rather than at lint time.
  assert.match(sign, /^      actions: read\b/m)
  // And no secret or OIDC where it is published.
  assert.match(publish, /^      contents: write\b/m)
  assert.doesNotMatch(publish, /id-token|attestations:/)
  for (const body of [release, build, sign]) assert.doesNotMatch(body, /OPEN_VSX_TOKEN/)
  assert.equal((workflow.match(/secrets\.OPEN_VSX_TOKEN/g) || []).length, 1)

  // The hand-off is by artifact id, and the bytes are the same digest end to end.
  const upload = named('Upload the extension as an artifact')
  assert.match(upload, /^        uses: actions\/upload-artifact@[0-9a-f]{40}/m)
  assert.ok(upload.includes('archive: false'))
  assert.ok(upload.includes('if-no-files-found: error'))
  assert.match(build, /^      artifact-id: \$\{\{ steps\.upload\.outputs\.artifact-id \}\}$/m)
  assert.match(build, /^      digest: \$\{\{ steps\.digest\.outputs\.sha256 \}\}$/m)
  const download = named('Download the VSIX artifact')
  assert.ok(download.includes('artifact-ids: ${{ needs.build.outputs.artifact-id }}'))
  assert.match(jobBody('sign'), /^      bundle-artifact-id: \$\{\{ steps\.bundle\.outputs\.artifact-id \}\}$/m)

  // The build job is a fresh checkout, where a draft's tag does not exist, so it
  // recreates the marker before --prepare-publish refuses an unresolvable tag.
  const marker = named('Mark the release tag locally')
  assert.ok(marker.includes('TAG: ${{ needs.release.outputs.tag }}'))
  assert.ok(marker.includes('git tag "$TAG" "$EVENT_SHA"'))
  assert.ok(workflow.indexOf('      - name: Mark the release tag locally\n') < workflow.indexOf('      - name: Decide what to package\n'))

  // Provenance is verified before the irreversible publish, from the file itself.
  const before = named('Verify build provenance before publishing')
  const sel = 'VSIX: dist/${{ needs.build.outputs.vsix }}'
  const bun = 'BUNDLE: dist/provenance-${{ needs.build.outputs.version }}.intoto.jsonl'
  assert.ok(before.includes(sel))
  assert.ok(before.includes(bun))
  assert.match(before, /gh attestation verify "\$VSIX" --bundle "\$BUNDLE" --repo "\$GITHUB_REPOSITORY"/)
  assert.match(before, /--signer-workflow "\$GITHUB_REPOSITORY\/\.github\/workflows\/publish\.yml"/)
  assert.match(before, /--source-digest "\$GITHUB_SHA" --source-ref refs\/heads\/main/)
  assert.match(before, /--deny-self-hosted-runners/)
  const publishStep = named('Publish to Open VSX')
  assert.ok(publishStep.includes('npm run vsix:publish --silent -- "$VSIX" --skip-duplicate'))
  assert.ok(publishStep.includes(sel))
  assert.match(named('Verify the Open VSX artifact'), /^        run: bash \.github\/scripts\/verify-open-vsx\.sh "\$VSIX" sasjs sasjs-for-vscode "\$VERSION" "\$BUNDLE"$/m)
  assert.ok(named('Attach the .vsix and provenance to the release').includes(sel))
  assert.match(named('Attach the .vsix and provenance to the release'), /node \.github\/scripts\/release-assets\.mjs attach "\$TAG" "\$EVENT_SHA" "\$VSIX" "\$BUNDLE"/)

  const order = ['Package the extension', 'Attest the VSIX', 'Verify the Open VSX artifact', 'Attach the .vsix and provenance to the release', 'Publish the release'].map(name => workflow.indexOf(`      - name: ${name}\n`))
  assert.deepEqual(order, [...order].sort((a, b) => a - b))
  assert.match(readFileSync('.github/workflows/run-tests.yml', 'utf8'), /^        run: node --test \.github\/scripts\/vsix-provenance\.test\.mjs \.github\/scripts\/vsix-retry\.test\.mjs \.github\/scripts\/release-assets\.test\.mjs \.github\/scripts\/release-workflow\.test\.mjs \.github\/scripts\/vsix-bind\.test\.mjs \.github\/scripts\/select-attestation-bundle\.test\.mjs$/m)
})

test('build uses the push SHA and reproducible ZIP timestamps, and verifies the actual release identity', () => {
  assert.match(workflow, /^          ref: \$\{\{ github\.sha \}\}$/m)
  const packageStep = named('Package the extension')
  assert.match(packageStep, /SOURCE_DATE_EPOCH=.*git (?:show|log)/)
  const gate = named('Work out whether this run still has something to publish')
  assert.doesNotMatch(gate, /git describe --tags --abbrev=0/)
  const identity = named('Verify release identity')
  assert.match(identity, /^        if: steps\.gate\.outputs\.publish == 'true'$/m)
  assert.match(identity, /run: node \.github\/scripts\/verify-release-identity\.mjs "\$TAG" "\$EVENT_SHA"/)
  assert.ok(identity.includes('TAG: ${{ steps.gate.outputs.tag }}'))
  assert.ok(identity.includes('EVENT_SHA: ${{ github.sha }}'))
  assert.ok(workflow.indexOf('      - name: Verify release identity\n') < workflow.indexOf('      - name: Decide what to package\n'))
})

test('release identity rejects stale drafts, ancestor tags and wrong push SHA', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vsix-identity-'))
  try {
    const git = (...args) => {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
      assert.equal(r.status, 0, r.stderr)
      return r.stdout.trim()
    }
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    writeFileSync(join(dir, 'file'), 'first')
    git('add', 'file'); git('commit', '-qm', 'first')
    const old = git('rev-parse', 'HEAD')
    writeFileSync(join(dir, 'file'), 'second')
    git('commit', '-qam', 'second')
    const sha = git('rev-parse', 'HEAD')
    git('tag', 'v1.0.0', sha)
    const remote = join(dir, 'remote.git')
    git('init', '--bare', '-q', remote)
    git('remote', 'add', 'origin', remote)
    git('push', '-q', 'origin', 'refs/tags/v1.0.0')
    const gh = join(dir, 'gh')
    writeFileSync(gh, `#!${process.execPath}\nconst data = JSON.parse(process.env.MOCK_RELEASES); if (process.env.MOCK_BIG) data[0][0].body = 'x'.repeat(1200000); process.stdout.write(JSON.stringify(data));\n`)
    chmodSync(gh, 0o755)
    const script = join(process.cwd(), '.github/scripts/verify-release-identity.mjs')
    const check = (event, target, tag = 'v1.0.0', draft = true, big = false) => spawnSync('node', [script, tag, event], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: 'test/repo', MOCK_BIG: big ? '1' : '', MOCK_RELEASES: JSON.stringify([[{ tag_name: tag, draft, target_commitish: target }]]) }
    })
    assert.equal(check(sha, sha).status, 0, 'matching tag and draft must pass')
    const large = check(sha, sha, 'v1.0.0', true, true)
    assert.equal(large.status, 0, `large paginated release response must pass: ${large.stderr}`)
    assert.notEqual(check(sha, old).status, 0, 'stale draft must fail')
    assert.notEqual(check(old, old).status, 0, 'wrong event SHA must fail')
    assert.notEqual(check(sha, 'main').status, 0, 'mutable draft target must fail')
    assert.notEqual(check(sha, sha, 'v1.0.0', false).status, 0, 'published release must fail')
    git('tag', '-f', 'v1.0.0', old)
    assert.notEqual(check(sha, sha).status, 0, 'local ancestor tag must fail')
    git('push', '-q', '--force', 'origin', 'refs/tags/v1.0.0')
    git('tag', '-f', 'v1.0.0', sha)
    assert.notEqual(check(sha, sha).status, 0, 'remote ancestor tag must fail even if draft target matches')
    git('push', '-q', 'origin', ':refs/tags/v1.0.0')
    assert.equal(check(sha, sha).status, 0, 'uncreated remote draft tag is valid')
    // A later job's checkout is a fresh clone: a draft creates no tag ref, so
    // there is no local tag to check. The draft target and the remote tag are what
    // the check can rely on there; a local tag that does exist must still match.
    git('tag', '-d', 'v1.0.0')
    assert.equal(check(sha, sha).status, 0, 'a fresh clone with no local tag must pass when the draft targets the push SHA')
    git('tag', 'v1.0.0', old)
    assert.notEqual(check(sha, sha).status, 0, 'a local tag naming another commit must still fail')
    git('tag', '-fa', 'v1.0.0', sha, '-m', 'release')
    git('push', '-q', 'origin', 'refs/tags/v1.0.0')
    assert.equal(check(sha, sha).status, 0, 'annotated remote tag is peeled')
    git('tag', '-fa', 'v1.0.0', old, '-m', 'older')
    git('push', '-q', '--force', 'origin', 'refs/tags/v1.0.0')
    git('tag', '-fa', 'v1.0.0', sha, '-m', 'release')
    assert.notEqual(check(sha, sha).status, 0, 'annotated remote ancestor tag must fail')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('release gate resumes a draft at the event commit when the release step emits no tag', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vsix-gate-'))
  try {
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      return result.stdout.trim()
    }
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    writeFileSync(join(dir, 'file'), 'source')
    git('add', 'file'); git('commit', '-qm', 'source')
    const sha = git('rev-parse', 'HEAD')
    git('tag', 'v1.0.0', sha)
    const gh = join(dir, 'gh')
    writeFileSync(gh, '#!/bin/sh\ncase "$*" in *"release create"*) printf "created\\n" >> "$MOCK_LOG";; *) printf "%s" "$MOCK_RELEASES";; esac\n')
    chmodSync(gh, 0o755)
    const gate = named('Work out whether this run still has something to publish')
    const body = gate.match(/^        run: \|\n((?:          .*\n|\n)+)/m)?.[1]
    assert.ok(body, 'gate must have an executable shell body')
    const script = body.replace(/^          /gm, '').replaceAll('${{ steps.release.outputs.tag }}', '').replaceAll('${{ github.repository }}', 'test/repo').replaceAll('${{ github.sha }}', sha)
    writeFileSync(join(dir, 'sleep'), '#!/bin/sh\nexit 0\n')
    chmodSync(join(dir, 'sleep'), 0o755)
    const output = join(dir, 'output')
    const log = join(dir, 'log')
    const run = (draft, event = sha, releases = draft === '' ? [[]] : [[{ tag_name: 'v1.0.0', draft: draft === 'true', target_commitish: sha }]], released = 'false') => {
      writeFileSync(output, ''); writeFileSync(log, '')
      const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TAG: '', RELEASED: released, GITHUB_OUTPUT: output, GITHUB_REPOSITORY: 'test/repo', GITHUB_SHA: event, MOCK_LOG: log, MOCK_RELEASES: JSON.stringify(releases) } })
      return { ...result, output: readFileSync(output, 'utf8'), log: readFileSync(log, 'utf8') }
    }
    let result = run('true')
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.output, /^tag=v1\.0\.0$/m)
    assert.match(result.output, /^publish=true$/m)
    result = run('false')
    assert.equal(result.status, 0)
    assert.match(result.output, /^publish=false$/m, 'already published is a no-op')
    result = run('false', sha, undefined, 'true')
    assert.equal(result.status, 0)
    assert.match(result.output, /^publish=false$/m, 'released=true with a public tag on HEAD is a no-op')
    result = run('')
    assert.notEqual(result.status, 0, 'an inferred tag without a release must fail closed')
    assert.doesNotMatch(result.output, /^publish=/m)
    assert.match(result.stdout + result.stderr, /Release for v1\.0\.0 is missing/)
    assert.equal(result.log, '', 'must not create a draft on an inferred tag')
    git('tag', 'v1.0.1', sha)
    result = run('true')
    assert.notEqual(result.status, 0, 'ambiguous exact tags must fail')
    git('tag', '-d', 'v1.0.1')
    writeFileSync(join(dir, 'file'), 'docs only')
    git('commit', '-qam', 'docs only')
    const newer = git('rev-parse', 'HEAD')
    result = run('true', newer, [[]])
    assert.equal(result.status, 0)
    assert.match(result.output, /^publish=false$/m, 'ancestor tag must not be selected')
    assert.doesNotMatch(result.output, /^tag=/m)
    result = run('true', sha)
    assert.notEqual(result.status, 0, 'wrong checkout must fail')
    git('reset', '--hard', sha)
    git('tag', '-d', 'v1.0.0')
    for (const malformed of [[[null]], [[{}]], [[{ tag_name: 'v1.0.0', draft: 'true', target_commitish: sha }]]]) {
      result = run('true', sha, malformed)
      assert.notEqual(result.status, 0, 'malformed draft discovery response must not become a no-op')
      assert.doesNotMatch(result.output, /^publish=/m)
    }
    for (const target of ['main', 'b'.repeat(40)]) {
      result = run('true', sha, [[{ tag_name: 'v1.0.0', draft: true, target_commitish: target }]])
      assert.equal(result.status, 0, 'an unmatched draft must not wedge the pipeline')
      assert.match(result.output, /^publish=false$/m, 'an unmatched draft cannot be resumed')
      assert.match(result.stderr, new RegExp(`no draft targets the push SHA; version drafts not resumed: v1\\.0\\.0 -> ${target === 'main' ? 'main' : 'b{40}'}`), 'must name the stray draft')
    }
    result = run('true', sha, [[{ tag_name: 'v1.0.0', draft: true, target_commitish: sha }, { tag_name: 'v1.0.1', draft: true, target_commitish: sha }]])
    assert.notEqual(result.status, 0, 'multiple drafts are ambiguous')
    result = run('true', sha, { unexpected: true })
    assert.notEqual(result.status, 0, 'malformed release list fails closed')
    result = run('true')
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.output, /^tag=v1\.0\.0$/m, 'recover draft whose remote tag does not yet exist')
    assert.match(result.output, /^publish=true$/m)
    assert.equal(git('rev-parse', 'refs/tags/v1.0.0^{commit}'), sha)
    writeFileSync(join(dir, 'git'), '#!/bin/sh\nif [ "$1" = tag ]; then exit 1; fi\nexec /usr/bin/git "$@"\n')
    chmodSync(join(dir, 'git'), 0o755)
    result = run('true')
    assert.notEqual(result.status, 0, 'failed tag discovery must not become a no-op')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('released=true replay of a public release consults the API and does not publish', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vsix-public-replay-'))
  try {
    const output = join(dir, 'output')
    const log = join(dir, 'log')
    writeFileSync(output, ''); writeFileSync(log, '')
    writeFileSync(join(dir, 'gh'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_LOG"\nprintf "%s" "$MOCK_RELEASES"\n')
    chmodSync(join(dir, 'gh'), 0o755)
    const body = named('Work out whether this run still has something to publish').match(/^        run: \|\n((?:          .*\n|\n)+)/m)?.[1]
    assert.ok(body)
    const script = body.replace(/^          /gm, '').replaceAll('${{ steps.release.outputs.tag }}', 'v1.0.0').replaceAll('${{ steps.release.outputs.released }}', 'true').replaceAll('${{ github.repository }}', 'test/repo')
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TAG: 'v1.0.0', RELEASED: 'true', GITHUB_OUTPUT: output, GITHUB_REPOSITORY: 'test/repo', MOCK_LOG: log, MOCK_RELEASES: JSON.stringify([[{ tag_name: 'v1.0.0', draft: false }]]) } })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(readFileSync(log, 'utf8'), /^api .*releases/m, 'must read the release API')
    assert.match(readFileSync(output, 'utf8'), /^publish=false$/m, 'public release is a no-op')
    assert.doesNotMatch(readFileSync(log, 'utf8'), /release create/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate consumes real gh pagination against a mock API and rejects HTTP errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-real-gh-'))
  let calls = []
  let deny = false
  const server = createServer((req, res) => {
    calls.push(req.url)
    if (deny) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"message":"Bad credentials"}'); return }
    res.setHeader('Content-Type', 'application/json')
    if (!req.url.includes('page=2')) {
      res.setHeader('Link', `<http://127.0.0.1:${server.address().port}/repos/test/repo/releases?per_page=100&page=2>; rel="next"`)
      res.end('[]')
    } else res.end('[{"tag_name":"v1.0.0","draft":false}]')
  })
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const body = named('Work out whether this run still has something to publish').match(/^        run: \|\n((?:          .*\n|\n)+)/m)?.[1]
    assert.ok(body)
    const endpoint = `http://127.0.0.1:${server.address().port}/repos/test/repo/releases?per_page=100`
    const script = body.replace(/^          /gm, '').replaceAll('${{ steps.release.outputs.tag }}', 'v1.0.0').replaceAll('${{ steps.release.outputs.released }}', 'true').replaceAll('repos/${GITHUB_REPOSITORY}/releases?per_page=100', endpoint)
    const output = join(dir, 'output')
    const run = async () => {
      writeFileSync(output, '')
      const child = spawn('bash', ['-e', '-o', 'pipefail', '-c', script], { cwd: dir, env: { ...process.env, TAG: 'v1.0.0', RELEASED: 'true', GITHUB_OUTPUT: output, GITHUB_REPOSITORY: 'test/repo', GH_ENTERPRISE_TOKEN: 'local-test-token' }, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      child.stdout.on('data', data => { stdout += data }); child.stderr.on('data', data => { stderr += data })
      const status = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
      return { status, stdout, stderr, output: readFileSync(output, 'utf8') }
    }
    let r = await run()
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`)
    assert.match(r.output, /^publish=false$/m)
    assert.equal(calls.length, 2, 'real gh must fetch the second page')
    deny = true; calls = []
    r = await run()
    assert.notEqual(r.status, 0); assert.match(r.stderr, /Bad credentials|401/)
    assert.doesNotMatch(r.output, /^publish=/m); assert.equal(calls.length, 1)
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('gate validates API responses and preserves draft, missing and error behavior', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vsix-gate-errors-'))
  try {
    const output = join(dir, 'output'); const log = join(dir, 'log')
    const git = (...args) => {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
      assert.equal(r.status, 0, r.stderr)
      return r.stdout.trim()
    }
    git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test')
    writeFileSync(join(dir, 'file'), 'source'); git('add', 'file'); git('commit', '-qm', 'source')
    const sha = git('rev-parse', 'HEAD'); git('tag', 'v1.0.0', sha)
    writeFileSync(join(dir, 'gh'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_LOG"\ncase "$*" in *"release create"*) exit "${MOCK_CREATE_FAIL:-0}";; *) [ "$MOCK_FAIL" != 1 ] || { printf "auth denied\\n" >&2; exit 1; }; printf "%s" "$MOCK_RELEASES";; esac\n')
    writeFileSync(join(dir, 'sleep'), '#!/bin/sh\nexit 0\n')
    chmodSync(join(dir, 'gh'), 0o755); chmodSync(join(dir, 'sleep'), 0o755)
    const body = named('Work out whether this run still has something to publish').match(/^        run: \|\n((?:          .*\n|\n)+)/m)?.[1]
    assert.ok(body)
    const run = (released, response, fail = false, createFail = false) => {
      writeFileSync(output, ''); writeFileSync(log, '')
      const script = body.replace(/^          /gm, '').replaceAll('${{ steps.release.outputs.tag }}', 'v1.0.0').replaceAll('${{ steps.release.outputs.released }}', released).replaceAll('${{ github.repository }}', 'test/repo')
      const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TAG: 'v1.0.0', RELEASED: released, GITHUB_OUTPUT: output, GITHUB_REPOSITORY: 'test/repo', MOCK_LOG: log, MOCK_RELEASES: response, MOCK_FAIL: fail ? '1' : '0', MOCK_CREATE_FAIL: createFail ? '1' : '0' } })
      return { ...result, output: readFileSync(output, 'utf8'), log: readFileSync(log, 'utf8') }
    }
    const draft = JSON.stringify([[], [{ tag_name: 'v1.0.0', draft: true }]])
    for (const released of ['true', 'false']) {
      const r = run(released, draft)
      assert.equal(r.status, 0, r.stderr); assert.match(r.output, /^publish=true$/m)
      assert.doesNotMatch(r.log, /release create/)
    }
    for (const response of ['not json', '{}', '[{}]', '[[null]]', '[[{"tag_name":"v1.0.0"}]]', '[[{"tag_name":"v1.0.0","draft":"false"}]]', '[[{"tag_name":"v1.0.0","draft":false},{"tag_name":"v1.0.0","draft":true}]]']) {
      const r = run('true', response)
      assert.notEqual(r.status, 0, response); assert.doesNotMatch(r.output, /^publish=/m); assert.doesNotMatch(r.log, /release create/)
    }
    let r = run('true', '[[{"tag_name":"v1.0.0","draft":false}]]', true)
    assert.notEqual(r.status, 0); assert.match(r.stderr, /auth denied/); assert.doesNotMatch(r.output, /^publish=/m)
    r = run('true', '[[]]')
    assert.notEqual(r.status, 0, 'invisible newly released draft must fail rather than publish or recreate')
    assert.doesNotMatch(r.output, /^publish=/m); assert.doesNotMatch(r.log, /release create/)
    r = run('false', '[[]]')
    assert.notEqual(r.status, 0, 'missing release with explicit tag must fail without creating a draft')
    assert.doesNotMatch(r.output, /^publish=/m); assert.doesNotMatch(r.log, /release create/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
