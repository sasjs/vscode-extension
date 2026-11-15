// Refuses to package while package.json still holds the placeholder version.
//
// `0.0.0` in git means "the release tag owns the version": the publish workflow
// stamps the tag's version in before packaging, so a checkout has nothing to
// claim. Anything that packages outside that workflow therefore builds a .vsix
// that states 0.0.0 - a version no release has, and one that would be refused by
// the marketplace only after it had already been uploaded.
//
// Exits non-zero rather than packaging, so a stale local build cannot be mistaken
// for a real one. The fix is in the message.

import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

if (manifest.version === '0.0.0') {
  console.error(
    [
      'package.json states 0.0.0, which is the placeholder for "the release tag owns the version".',
      '',
      'The publish workflow stamps the tag version in before packaging, so packaging here would',
      'produce a .vsix claiming a version no release has. Either let the workflow do it, or set',
      'the version first:',
      '',
      '  npm version <x.y.z> --no-git-tag-version',
      ''
    ].join('\n')
  )
  process.exit(1)
}

console.log(`packaging version ${manifest.version}`)
