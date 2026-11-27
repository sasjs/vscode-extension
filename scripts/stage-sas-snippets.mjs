import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(process.argv[2] || resolve(root, 'vendor/sas-snippets/proc-snippets.json'))
const target = resolve(process.argv[3] || root, 'snippets')
const bytes = readFileSync(source)
const expected = '4627235ead83531a38b6b1fa98d5de00f0fd4509931038f8425a458addc6ae2f'
if (createHash('sha256').update(bytes).digest('hex') !== expected) {
  throw new Error('SAS snippet integrity check failed')
}
mkdirSync(target, { recursive: true })
writeFileSync(resolve(target, 'proc-snippets.json'), bytes)
