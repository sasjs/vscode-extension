import * as fs from 'fs'
import * as path from 'path'
import { spawnSync } from 'child_process'
import * as ts from 'typescript'

// Exercise the actual harness in a separate Node process: Jest cannot execute
// its native dynamic import of Mocha. Fixtures mirror the compiled test tree.
describe('integration test discovery', () => {
  let root: string
  let suiteDir: string

  beforeEach(() => {
    // Keep fixtures below the checkout so native Mocha import resolves the
    // installed dependency on Windows too, without requiring symlink rights.
    root = fs.mkdtempSync(path.join(process.cwd(), '.test-discovery-'))
    suiteDir = path.join(root, 'test', 'suite')
    fs.mkdirSync(suiteDir, { recursive: true })
    const source = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.Node16, target: ts.ScriptTarget.ES2020 }
    }).outputText
    fs.writeFileSync(path.join(suiteDir, 'index.js'), compiled)
  })

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  const runHarness = () => spawnSync(process.execPath, [
    '-e',
    'require(process.argv[1]).run().catch(e => { console.error(e.message); process.exitCode = 1 })',
    path.join(suiteDir, 'index.js')
  ], { encoding: 'utf8' })

  it('runs the suite files rather than sibling files in the parent directory', () => {
    fs.writeFileSync(path.join(root, 'test', 'ignored.test.js'), 'throw new Error(\'parent fixture loaded\')')
    fs.writeFileSync(path.join(suiteDir, 'first.test.js'), 'suite(\'first fixture\', () => test(\'runs first\', () => {}))')
    fs.writeFileSync(path.join(suiteDir, 'second.test.js'), 'suite(\'second fixture\', () => test(\'runs second\', () => {}))')
    const result = runHarness()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('runs first')
    expect(result.stdout).toContain('runs second')
    expect(result.stdout).toContain('2 passing')
  })

  it('fails rather than reporting success when no suite tests are discovered', () => {
    const result = runHarness()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('No integration test files found')
  })
})
