#!/usr/bin/env node
// A GitHub draft's target matters only until the tag exists. Check both.
import { execFileSync } from 'node:child_process'

try {
  const [tag, event] = process.argv.slice(2)
  if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag || '') || !/^[0-9a-f]{40}$/.test(event || '')) throw new Error('invalid tag or push SHA')
  // The paginated release list includes bodies and can exceed Node's 1 MiB default.
  const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim()
  if (run('git', ['rev-parse', 'HEAD']) !== event) throw new Error('checkout differs from push SHA')
  // A draft release creates no tag ref, so a fresh clone - a later job in the
  // same run, or a retry - legitimately has no local tag. When one exists it must
  // name the push SHA; the release target and any remote tag are checked below,
  // and those are the checks that mean something outside the cloning job.
  let local = null
  try {
    local = run('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`])
  } catch (error) {
    local = null
  }
  if (local !== null && local !== event) throw new Error('local tag differs from push SHA')
  const pages = JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100`]))
  if (!Array.isArray(pages) || pages.some(page => !Array.isArray(page))) throw new Error('invalid releases response')
  const releases = pages.flat().filter(r => r.tag_name === tag)
  if (releases.length !== 1 || releases[0].draft !== true || releases[0].target_commitish !== event) throw new Error('draft release does not uniquely name the push SHA')
  const refs = run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).split('\n').filter(Boolean).map(line => line.split(/\s+/))
  if (refs.some(([sha, ref]) => !/^[0-9a-f]{40}$/.test(sha) || ![`refs/tags/${tag}`, `refs/tags/${tag}^{}`].includes(ref))) throw new Error('invalid remote tag response')
  const peeled = refs.find(([, ref]) => ref.endsWith('^{}'))
  const direct = refs.find(([, ref]) => ref === `refs/tags/${tag}`)
  if ((peeled && !direct) || (peeled || direct)?.[0] && (peeled || direct)[0] !== event) throw new Error('remote tag differs from push SHA')
  console.log(`${tag}: checkout, draft and any remote tag match ${event}`)
} catch (error) {
  console.error(`::error::release identity verification failed: ${error.message}`)
  process.exitCode = 1
}
