#!/usr/bin/env node
// Attach without deleting conflicts; verify GitHub's full paginated asset list.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

try {
  const [mode, tag, event, vsix, bundle] = process.argv.slice(2)
  const repo = process.env.GITHUB_REPOSITORY || ''
  if (!['attach', 'verify'].includes(mode) || !/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag || '') || !/^[0-9a-f]{40}$/.test(event || '') || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !vsix || !bundle) throw Error('invalid arguments')
  const files = [vsix, bundle].map(path => {
    const name = basename(path), bytes = readFileSync(path)
    if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(name) || !bytes.length) throw Error('invalid or empty asset')
    return { path, name, digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex') }
  })
  if (!files[0].name.endsWith('.vsix') || !files[1].name.endsWith('.intoto.jsonl') || files[0].name === files[1].name) throw Error('invalid asset names')
  const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const pages = endpoint => {
    const data = JSON.parse(gh(['api', '--paginate', '--slurp', endpoint]))
    if (!Array.isArray(data) || !data.length || data.some(page => !Array.isArray(page))) throw Error('invalid paginated API response')
    return data.flat()
  }
  const draft = () => {
    const found = pages(`repos/${repo}/releases?per_page=100`).filter(r => r?.tag_name === tag)
    if (found.length !== 1 || found[0].draft !== true || found[0].target_commitish !== event || !Number.isSafeInteger(found[0].id) || found[0].id <= 0) throw Error('draft release identity changed')
    return found[0].id
  }
  const inspect = (id, requireAll) => {
    const assets = pages(`repos/${repo}/releases/${id}/assets?per_page=100`)
    const seen = new Set()
    for (const asset of assets) {
      const expected = files.find(f => f.name === asset?.name)
      if (!expected || seen.has(asset.name) || asset.state !== 'uploaded' || asset.digest !== expected.digest) throw Error(`unexpected or mismatched draft asset: ${asset?.name}`)
      seen.add(asset.name)
    }
    if (requireAll && seen.size !== files.length) throw Error('missing draft assets')
    return seen
  }
  const id = draft()
  const seen = inspect(id, mode === 'verify')
  if (mode === 'attach') {
    for (const file of files) {
      if (seen.has(file.name)) continue
      // Recheck the ID before each write; GitHub rejects an existing same-name
      // asset (422). Never delete a conflict. This is not a cross-writer lock.
      if (draft() !== id) throw Error('draft release was replaced')
      gh(['api', '--method', 'POST', '-H', 'Content-Type: application/octet-stream', '--input', file.path, `https://uploads.github.com/repos/${repo}/releases/${id}/assets?name=${encodeURIComponent(file.name)}`])
    }
    if (draft() !== id) throw Error('draft release was replaced')
    inspect(id, true)
  }
  console.log(`${tag}: draft assets match expected SHA-256 digests`)
} catch (error) {
  console.error(`::error::draft asset verification failed: ${error.message}`)
  process.exitCode = 1
}
