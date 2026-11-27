import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const rootDir = process.cwd()
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

function fixture () {
  const root = mkdtempSync(join(tmpdir(), 'sas setup spaces '))
  mkdirSync(join(root, 'scripts'))
  cpSync('scripts', join(root, 'scripts'), { recursive: true })
  cpSync('sasjs', join(root, 'sasjs'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: pkg.scripts }))
  const modules = join(root, 'node_modules')
  mkdirSync(join(modules, '@sasjs'), { recursive: true })
  // Use the real installed CLI and its dependencies, but an isolated unpublished
  // language package whose exported files can be removed independently.
  for (const entry of readdirSync('node_modules', { withFileTypes: true })) {
    if (entry.name === '@sasjs' || !entry.isDirectory()) continue
    symlinkSync(resolve('node_modules', entry.name), join(modules, entry.name), 'junction')
  }
  for (const entry of readdirSync('node_modules/@sasjs', { withFileTypes: true })) {
    if (entry.name === 'sas-language' || !entry.isDirectory()) continue
    symlinkSync(resolve('node_modules/@sasjs', entry.name), join(modules, '@sasjs', entry.name), 'junction')
  }
  const lang = join(modules, '@sasjs', 'sas-language')
  mkdirSync(join(lang, 'snippets'), { recursive: true })
  mkdirSync(join(lang, 'server'))
  const original = join(rootDir, 'node_modules/@sasjs/sas-language')
  for (const file of ['NOTICE', 'LICENSE', 'provenance.json', 'server/LICENSE.txt', 'snippets/functions.json']) {
    copyFileSync(join(original, file), join(lang, file))
  }
  const bytes = Buffer.from('{"proc fixture":{"prefix":"proc fixture","body":["proc fixture;"]}}\n')
  writeFileSync(join(lang, 'snippets/procedures.json'), bytes)
  writeFileSync(join(lang, 'package.json'), JSON.stringify({ name: '@sasjs/sas-language', exports: {
    './snippets/functions.json': './snippets/functions.json',
    './snippets/procedures.json': './snippets/procedures.json'
  } }))
  return { root, lang, bytes }
}

function setup (root) {
  return spawnSync('npm', ['run', 'setup'], { cwd: root, shell: process.platform === 'win32', encoding: 'utf8', timeout: 120000 })
}

test('real setup stages package proc snippets and attribution, and fails when the export is missing', () => {
  const { root, lang, bytes } = fixture()
  try {
    const ok = setup(root)
    assert.ifError(ok.error)
    assert.equal(ok.status, 0, ok.stdout + ok.stderr)
    assert.deepEqual(readFileSync(join(root, 'snippets/proc-snippets.json')), bytes)
    for (const [source, staged] of [
      ['NOTICE', 'NOTICE.sas-language'],
      ['LICENSE', 'LICENSE.sas-language'],
      ['server/LICENSE.txt', 'LICENSE.sas-upstream.txt'],
      ['provenance.json', 'provenance.sas-language.json']
    ]) {
      assert.deepEqual(readFileSync(join(root, 'snippets', staged)), readFileSync(join(lang, source)))
    }
    rmSync(join(lang, 'snippets/procedures.json'))
    const missing = setup(root)
    assert.ifError(missing.error)
    assert.notEqual(missing.status, 0, 'setup must fail even when a stale staged snippet exists')
    assert.match(missing.stderr, /procedures\.json/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
