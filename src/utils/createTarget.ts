import { OutputChannel, workspace } from 'vscode'

import { Target } from '@sasjs/utils/types'
import {
  getServerType,
  getServerUrl,
  getTargetName,
  getChoiceInput
} from './input'
import { authenticateTarget } from './auth'
import { saveToConfigFile } from './config'
import { isSasjsProject } from './utils'

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
    const choice = await getChoiceInput(
      ['Yes, No'],
      'Do you want to create local target?'
    )
    if (choice === 'Yes') {
      isLocal = true
    }
  }

  await authenticateTarget(targetJson, isLocal, outputChannel)

  const target = new Target(targetJson)

  await saveToConfigFile(target, isLocal, outputChannel)

  const extConfig = workspace.getConfiguration('sasjs-for-vscode')
  await extConfig.update('target', target.name)
  await extConfig.update('isLocal', isLocal)

  return target
}
