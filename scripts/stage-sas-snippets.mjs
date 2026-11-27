import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const source = require.resolve('@sasjs/sas-language/snippets/procedures.json')
const packageRoot = resolve(dirname(source), '..')
const target = resolve(process.cwd(), 'snippets')
mkdirSync(target, { recursive: true })
copyFileSync(source, resolve(target, 'proc-snippets.json'))
// Distribute the upstream licence and the package's attribution and provenance
// with the copied snippets, even if packaging excludes node_modules.
for (const [from, to] of [
  ['NOTICE', 'NOTICE.sas-language'],
  ['LICENSE', 'LICENSE.sas-language'],
  ['server/LICENSE.txt', 'LICENSE.sas-upstream.txt'],
  ['provenance.json', 'provenance.sas-language.json']
]) {
  copyFileSync(resolve(packageRoot, from), resolve(target, to))
}
