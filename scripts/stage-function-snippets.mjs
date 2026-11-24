import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const source = process.argv[2] || dirname(require.resolve('@sasjs/sas-language/snippets/functions.json'))
const root = resolve(process.argv[3] || process.cwd())
const target = resolve(root, 'snippets')
mkdirSync(target, { recursive: true })
for (const [from, to] of [
  ['functions.json', 'function-snippets.json'],
  ['LICENSE.txt', 'function-snippets-LICENSE.txt'],
  ['README.md', 'function-snippets-README.md']
]) {
  copyFileSync(resolve(source, from), resolve(target, to))
}
