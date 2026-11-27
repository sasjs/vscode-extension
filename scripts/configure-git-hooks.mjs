import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

if (existsSync('.git')) {
  const result = spawnSync('git', ['config', 'core.hooksPath', './.git-hooks'], { stdio: 'inherit' })
  if (result.error || result.status !== 0) {
    console.warn('Could not configure git hooks; continuing setup')
  }
}
