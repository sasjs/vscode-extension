import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test('retry test uses the platform temp directory instead of a machine-specific home', () => {
  const source = readFileSync('.github/scripts/vsix-retry.test.mjs', 'utf8')
  assert.match(source, /mkdtempSync\(join\(tmpdir\(\),/)
  assert.doesNotMatch(source, /['"]\/home\/user\//)
})

test('step outputs are passed through environment, never interpolated into shell code', () => {
  const workflow = readFileSync('.github/workflows/publish.yml', 'utf8')
  const lines = workflow.split('\n')
  let shell = false
  for (const line of lines) {
    if (/^        run:/.test(line)) {
      shell = /^        run: \|/.test(line)
      assert.doesNotMatch(line, /\$\{\{\s*steps\./)
    } else if (shell && /^        \S/.test(line)) shell = false
    if (shell) assert.doesNotMatch(line, /\$\{\{\s*steps\./)
  }
})

test('workflow serializes release runs and fails before either publish when its gates fail', () => {
  const workflow = readFileSync('.github/workflows/publish.yml', 'utf8')
  assert.match(workflow, /^concurrency:\n  group: vscode-extension-release\n  cancel-in-progress: false\n  queue: max$/m)
  const body = name => {
    const step = workflow.split(`      - name: ${name}\n`)[1]?.split(/\n      - (?:name:|uses:|run:)/)[0]
    const shell = step?.match(/^        run: \|\n((?:          .*\n|\n)+)/m)?.[1]
    assert.ok(shell, `missing shell for ${name}`)
    return shell.replace(/^          /gm, '').replaceAll('${{ steps.package.outputs.vsix }}', 'extension.vsix').replaceAll('${{ github.sha }}', 'a'.repeat(40))
  }
  const dir = mkdtempSync(join(tmpdir(), 'release-publish-'))
  try {
    const log = join(dir, 'log')
    for (const cmd of ['node', 'npm', 'gh']) {
      writeFileSync(join(dir, cmd), `#!/bin/sh\nprintf '%s\\n' '${cmd} '"$*" >> "$LOG"\ncase "${cmd}:$*" in node:*verify-release-identity*) [ "$FAIL_IDENTITY" != 1 ];; node:*release-assets*) [ "$FAIL_ASSETS" != 1 ];; esac\n`)
      chmodSync(join(dir, cmd), 0o755)
    }
    const run = (name, env = {}) => {
      writeFileSync(log, '')
      const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', body(name)], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, LOG: log, TAG: 'v1.0.0', EVENT_SHA: 'a'.repeat(40), OVSX_PAT: 'test', VSIX: 'extension.vsix', BUNDLE: 'provenance.intoto.jsonl', ...env } })
      return { ...result, log: readFileSync(log, 'utf8') }
    }
    let r = run('Publish to Open VSX')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.log, /^node .*verify-release-identity.*\nnpm .*vsix:publish/m)
    r = run('Publish to Open VSX', { FAIL_IDENTITY: '1' })
    assert.notEqual(r.status, 0); assert.doesNotMatch(r.log, /^npm /m)
    r = run('Publish the release')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.log, /^node .*verify-release-identity.*\nnode .*release-assets.*publish/m)
    assert.doesNotMatch(r.log, /^gh /m)
    for (const failure of ['FAIL_IDENTITY', 'FAIL_ASSETS']) {
      r = run('Publish the release', { [failure]: '1' })
      assert.notEqual(r.status, 0); assert.doesNotMatch(r.log, /^gh /m)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
