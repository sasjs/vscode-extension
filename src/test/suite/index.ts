import * as fs from 'fs'
import * as path from 'path'

/**
 * Collects the compiled test files without a glob library. The test tree is
 * small and flat - suite/*.test.js - so a directory read is enough, and it
 * keeps this CJS-compiled harness free of the ESM-only `glob` package.
 */
const findTestFiles = (root: string): string[] =>
  fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => path.join(root, entry.name))

/** The mocha class, loaded from mocha's ESM-only entry at runtime. */
type MochaClass = new (options: Record<string, unknown>) => {
  addFile: (file: string) => void
  run: (callback: (failures: number) => void) => void
}

export function run(): Promise<void> {
  return new Promise((c, e) => {
    // mocha 12 is ESM-only (type: module) while this harness compiles to
    // CommonJS, so the module loads through a dynamic import - the supported
    // interop path. The namespace carries the class both as `Mocha` and as
    // the interop default; both are the same class at runtime.
    import('mocha')
      .then((imported) => {
        const mod = imported as unknown as {
          Mocha?: MochaClass
          default?: MochaClass
        }
        const MochaClass = mod.Mocha ?? mod.default
        if (!MochaClass) {
          throw new Error('mocha loaded without an exported class')
        }
        const mocha = new MochaClass({
          ui: 'tdd',
          color: true
        })

        const testsRoot = path.resolve(__dirname, '..')

        // Add files to the test suite
        findTestFiles(testsRoot).forEach((f) => mocha.addFile(f))

        // Run the mocha test
        mocha.run((failures) => {
          if (failures > 0) {
            e(new Error(`${failures} tests failed.`))
          } else {
            c()
          }
        })
      })
      .catch((err) => {
        console.error(err)
        e(err)
      })
  })
}
