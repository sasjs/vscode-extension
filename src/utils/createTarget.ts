import { window, workspace } from 'vscode'

import { Target } from '@sasjs/utils/types'
import {
  getServerType,
  getServerUrl,
  getTargetName,
  getChoiceInput
} from './input'
import { authenticateTarget } from './auth'
import { saveToConfigFile } from './config'
import { getGlobalConfigurationPath, getLocalConfigurationPath } from './utils'
import { setConstants } from './setConstants'

export const createTarget = async () => {
  const name = await getTargetName()
  const serverUrl = await getServerUrl()
  const serverType = await getServerType()
  const targetJson: any = {
    name,
    serverUrl,
    serverType,
    appLoc: '/Public/app'
  }

  let isLocal = false

  if (process.isSasjsProject) {
    const globalConfigPath = getGlobalConfigurationPath()
    const localConfigPath = getLocalConfigurationPath()

    const choice = await getChoiceInput(
      [globalConfigPath, localConfigPath],
      'Where do you want to save your target?'
    )

    if (choice !== globalConfigPath) {
      isLocal = true
    }
  }

  await authenticateTarget(targetJson, isLocal).catch((err) => {
    const errTitle = `Error while authenticating target '${name}'.`
    window.showErrorMessage(errTitle)

    // TODO: create a utility
    process.outputChannel.appendLine([errTitle, err.toString()].join(' '))
    process.outputChannel.show()
  })

  const target = new Target(targetJson)

  await saveToConfigFile(target, isLocal)

  const extConfig = workspace.getConfiguration('sasjs-for-vscode')
  await extConfig.update('target', target.name, true)
  await extConfig.update('isLocal', isLocal, true)

  await setConstants()

  return { target, isLocal }
}
