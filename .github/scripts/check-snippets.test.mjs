import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { checkSnippets, checkListing } from './check-snippets.mjs'

const require = createRequire(import.meta.url)

const snippet = { prefix: 'proc sql', body: 'proc sql;' }
const pkgWith = paths => ({ contributes: { snippets: paths.map(path => ({ language: 'sas', path })) } })

function fixture (paths, files) {
  const root = mkdtempSync(join(tmpdir(), 'snippets-'))
  mkdirSync(join(root, 'snippets'), { recursive: true })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, 'snippets', name), content)
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkgWith(paths)))
  return root
}

test('declared snippet files that exist and parse are accepted', () => {
  const root = fixture(['./snippets/proc.json', './snippets/macro.json'], {
    'proc.json': JSON.stringify([snippet]),
    'macro.json': JSON.stringify([{ name: 'macro', body: '%macro x;' }])
  })
  try {
    assert.deepEqual(checkSnippets({ pkg: pkgWith(['./snippets/proc.json', './snippets/macro.json']), root }), [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the 3.3.0 bug is refused: a declared file the package does not contain', () => {
  const root = fixture(['./snippets/proc-snippets.json', './snippets/function-snippets.json'], {
    'proc-snippets.json': JSON.stringify([snippet])
  })
  try {
    const problems = checkSnippets({ pkg: pkgWith(['./snippets/proc-snippets.json', './snippets/function-snippets.json']), root })
    assert.equal(problems.length, 1)
    assert.match(problems[0], /not in the package: \.\/snippets\/function-snippets\.json/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the object spelling upstream actually uses is accepted', () => {
  const root = fixture(['./snippets/proc-snippets.json'], {
    'proc-snippets.json': JSON.stringify({ 'proc print': { prefix: 'print', body: ['proc print data=$1;', 'run;'] } })
  })
  try {
    assert.deepEqual(checkSnippets({ pkg: pkgWith(['./snippets/proc-snippets.json']), root }), [])
    // An object entry with no body is still refused.
    writeFileSync(join(root, 'snippets', 'proc-snippets.json'), JSON.stringify({ 'proc print': { prefix: 'print' } }))
    assert.match(checkSnippets({ pkg: pkgWith(['./snippets/proc-snippets.json']), root })[0], /has no body/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('invalid, empty, malformed and escaping contributions are refused', () => {
  const root = fixture(['./snippets/a.json', './snippets/b.json', './snippets/c.json', './snippets/d.json', './snippets/e.json'], {
    'a.json': 'not json',
    'b.json': '[]',
    'c.json': JSON.stringify([{ body: 'no prefix' }]),
    'd.json': JSON.stringify([snippet]),
    'e.json': JSON.stringify([snippet])
  })
  try {
    const cases = [
      ['./snippets/a.json', /not valid JSON/],
      ['./snippets/b.json', /not a non-empty array or object/],
      ['./snippets/c.json', /has no body, or no prefix\/name/],
      ['/etc/passwd', /absolute path/],
      ['../escape.json', /escapes the package/],
      ['', /has no path/]
    ]
    for (const [path, expected] of cases) {
      const problems = checkSnippets({ pkg: pkgWith([path]), root })
      assert.equal(problems.length, 1, `${path} produced ${JSON.stringify(problems)}`)
      assert.match(problems[0], expected)
    }
    // A package that declares nothing must not pass vacuously.
    const none = checkSnippets({ pkg: { contributes: {} }, root })
    assert.match(none[0], /nothing to check/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a directory whose name starts with dots is not an escape', () => {
  // `..snippets/x.json` is inside the package; only `..` and `../` leave it.
  const root = mkdtempSync(join(tmpdir(), 'snippets-'))
  try {
    mkdirSync(join(root, '..snippets'), { recursive: true })
    writeFileSync(join(root, '..snippets', 'x.json'), JSON.stringify([snippet]))
    assert.deepEqual(checkSnippets({ pkg: pkgWith(['./..snippets/x.json']), root }), [])
    assert.match(checkSnippets({ pkg: pkgWith(['../outside.json']), root })[0], /escapes the package/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Jest measures source but not the editor-host test tree', () => {
  const { globsToMatcher } = require('jest-util')
  const { collectCoverageFrom } = require('../../jest.config.js')
  const matchesCoverage = globsToMatcher(collectCoverageFrom)
  assert.equal(matchesCoverage('src/test/suite/languageServer.test.ts'), false)
  assert.equal(matchesCoverage('src/languageServer/languageServer.ts'), true)
})

test('the extension preserves SAS function snippets with argument placeholders', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const path = './vendor/sas-function-snippets.json'
  assert.ok(pkg.contributes.snippets.some(entry => entry.language === 'sas' && entry.path === path), 'the SAS function snippets must be contributed')
  const snippets = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(snippets.sum.prefix, 'sum')
  assert.deepEqual(snippets.sum.body, ['sum(${1})'])
  assert.deepEqual(snippets.atan2.body, ['atan2(${1:x}, ${2:y})'])
})

test('the packaged listing must contain every declared contribution', () => {
  const pkg = pkgWith(['./snippets/proc-snippets.json', './snippets/function-snippets.json'])
  // `vsce ls` paths are relative to the extension root, without the leading ./.
  assert.deepEqual(checkListing({ pkg, listing: 'out/extension.js\nsnippets/proc-snippets.json\nsnippets/function-snippets.json\n' }), [])
  const missing = checkListing({ pkg, listing: 'out/extension.js\nsnippets/proc-snippets.json\n' })
  assert.equal(missing.length, 1)
  assert.match(missing[0], /not in the package listing: snippets\/function-snippets\.json/)
  assert.match(checkListing({ pkg: { contributes: {} }, listing: 'x' })[0], /nothing to check/)
})

test('the check runs where the snippets were fetched, in both workflows', () => {
  // After `npm run setup`, or the check inspects an empty directory and fails
  // for the wrong reason; and in the release job, or a bad fetch ships.
  const pr = readFileSync('.github/workflows/run-tests.yml', 'utf8')
  const prSetup = pr.indexOf('run: npm run setup')
  const prCheck = pr.indexOf('node .github/scripts/check-snippets.mjs')
  assert.ok(prSetup >= 0 && prCheck > prSetup, 'the PR build must check the fetched snippets')
  assert.match(pr, /check-snippets\.mjs --vsix-list "\$RUNNER_TEMP\/vsix-files\.txt"/)
  const release = readFileSync('.github/workflows/publish.yml', 'utf8')
  const setup = release.indexOf('run: npm run setup')
  const check = release.indexOf('node .github/scripts/check-snippets.mjs')
  assert.ok(setup > 0 && check > setup, 'the release build must check the fetched snippets before packaging')
  // And unconditionally: a step that can be skipped is not a gate. Anchored on
  // the command, not the step name - slicing from a name that had been reworded
  // would give an empty string, and doesNotMatch on nothing passes vacuously.
  const command = release.indexOf('node .github/scripts/check-snippets.mjs')
  assert.ok(command > 0, 'the release build must run the snippet check')
  const stepStart = release.lastIndexOf('\n      - ', command)
  const stepEnd = release.indexOf('\n      - ', command)
  assert.ok(stepStart > 0, 'the check must be a step of its own')
  const block = release.slice(stepStart, stepEnd === -1 ? release.length : stepEnd)
  assert.match(block, /^      - name: /m)
  assert.doesNotMatch(block, /^        (?:if|continue-on-error):/m)
})

test('setup propagates either snippet failure but tolerates failed git hook configuration', () => {
  const setup = JSON.parse(readFileSync('package.json', 'utf8')).scripts.setup
  const root = mkdtempSync(join(tmpdir(), 'snippet-setup-'))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nprintf "%s\\n" "$2" >> "$CALLS"\n[ "$2" != "$FAIL_SCRIPT" ]\n', { mode: 0o755 })
  writeFileSync(join(bin, 'git'), '#!/bin/sh\nprintf "git\\n" >> "$CALLS"\nexit 1\n', { mode: 0o755 })
  const run = fail => {
    const calls = join(root, 'calls')
    writeFileSync(calls, '')
    const result = spawnSync('/bin/sh', ['-c', setup], {
      cwd: root,
      env: { ...process.env, PATH: bin, CALLS: calls, FAIL_SCRIPT: fail },
      encoding: 'utf8'
    })
    assert.ifError(result.error)
    return { status: result.status, calls: readFileSync(calls, 'utf8').trim().split('\n') }
  }
  try {
    assert.deepEqual(run('sas:snippets'), { status: 1, calls: ['sas:snippets'] })
    assert.deepEqual(run('sasjs:snippets'), { status: 1, calls: ['sas:snippets', 'sasjs:snippets'] })
    assert.deepEqual(run(''), { status: 0, calls: ['sas:snippets', 'sasjs:snippets'] })
    mkdirSync(join(root, '.git'))
    assert.deepEqual(run(''), { status: 0, calls: ['sas:snippets', 'sasjs:snippets', 'git'] })
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the CLI exits non-zero on a missing contribution and reports the file', () => {
  const root = fixture(['./snippets/proc-snippets.json', './snippets/function-snippets.json'], {
    'proc-snippets.json': JSON.stringify([snippet])
  })
  try {
    const r = spawnSync('node', [join(process.cwd(), '.github/scripts/check-snippets.mjs')], { cwd: root, encoding: 'utf8' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /::error::snippet contribution 1 points at a file that is not in the package/)
    assert.match(r.stderr, /would advertise snippet files it does not contain/)

    writeFileSync(join(root, 'snippets', 'function-snippets.json'), JSON.stringify([snippet]))
    const ok = spawnSync('node', [join(process.cwd(), '.github/scripts/check-snippets.mjs')], { cwd: root, encoding: 'utf8' })
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(ok.stdout, /snippet contributions check out/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
