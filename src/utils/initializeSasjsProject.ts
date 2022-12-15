import * as path from 'path'
import { workspace } from 'vscode'
import { createFile } from './file'
import { setConstants } from './setConstants'

export const initializeSasjsProject = async () => {
  const config = {
    $schema:
      'https://raw.githubusercontent.com/sasjs/utils/main/src/types/sasjsconfig-schema.json',
    jobConfig: {
      jobFolders: [process.projectDir]
    },
    defaultTarget: 'sasjsdoc',
    targets: [
      {
        name: 'sasjsdoc',
        serverUrl: '',
        serverType: 'SASJS',
        appLoc: '/Public/app/docs'
      }
    ]
  }
  const configPath = path.join(process.projectDir, 'sasjs', 'sasjsconfig.json')
  await createFile(configPath, JSON.stringify(config, null, 2))

  const extConfig = workspace.getConfiguration('sasjs-for-vscode')
  await extConfig.update('target', 'sasjsdoc')
  await extConfig.update('isLocal', true)
  await setConstants()

  process.isSasjsProject = true
}
