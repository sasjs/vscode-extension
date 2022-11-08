import * as path from 'path'
import { workspace } from 'vscode'
import { LintConfig, DefaultLintConfiguration } from '@sasjs/lint'
import { readFile } from './file'

export const getLintConfig = async () => {
  let config = DefaultLintConfiguration

  let lintConfigPath = ''

  if (workspace.workspaceFolders?.length) {
    lintConfigPath = path.join(
      workspace.workspaceFolders[0].uri.fsPath,
      '.sasjslint'
    )
  }

  await readFile(lintConfigPath)
    .then((content) => {
      config = { ...config, ...JSON.parse(content) }
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
