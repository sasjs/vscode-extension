import * as path from 'path'
import * as os from 'os'
import { workspace } from 'vscode'
import { LintConfig, DefaultLintConfiguration } from '@sasjs/lint'
import { readFile } from './file'
import { fileExists } from '@sasjs/utils'

export const getLintConfig = async () => {
  let config = DefaultLintConfiguration

  let lintConfigPath = path.join(os.homedir(), '.sasjslint')

  if (await fileExists(path.join(process.projectDir, '.sasjslint'))) {
    lintConfigPath = path.join(process.projectDir, '.sasjslint')
  }

  await readFile(lintConfigPath)
    .then((content) => {
      config = JSON.parse(content)
    })
    .catch(() => {
      const extConfig = workspace.getConfiguration('sasjs-for-vscode')
      const lintConfig = extConfig.get('lintConfig') as Object
      if (Object.keys(lintConfig).length) {
        config = { ...config, ...lintConfig }
      }
    })

  return new LintConfig(config)
}
