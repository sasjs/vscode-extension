import { OutputChannel, workspace } from 'vscode'

import { Target } from '@sasjs/utils/types'
import {
  getServerType,
  getServerUrl,
  getTargetName,
  getChoiceInput
} from './input'
import { authenticateTarget } from './auth'
import { getGlobalConfiguration, saveToConfigFile } from './config'
import {
  getGlobalConfigurationPath,
  getLocalConfigurationPath,
  isSasjsProject
} from './utils'

export const createTarget = async (outputChannel: OutputChannel) => {
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

  if (await isSasjsProject()) {
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

  await authenticateTarget(targetJson, isLocal, outputChannel)

  const target = new Target(targetJson)

  await saveToConfigFile(target, isLocal, outputChannel)

  const extConfig = workspace.getConfiguration('sasjs-for-vscode')
  await extConfig.update('target', target.name)
  await extConfig.update('isLocal', isLocal)

  return { target, isLocal }
}
