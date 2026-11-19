import { execFileSync } from 'node:child_process'
import * as path from 'node:path'

describe('real formatting provider', () => {
  it('aligns macro end after returned values and remains stable', () => {
    execFileSync(process.execPath, [
      '-r',
      'ts-node/register/transpile-only',
      path.resolve('scripts/format-provider-regression.cjs')
    ], { stdio: 'pipe' })
  })
})
