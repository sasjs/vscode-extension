import { OutputChannel } from 'vscode'

import { Target } from '@sasjs/utils/types'
import { getServerType, getServerUrl, getTargetName } from './input'
import { authenticateTarget } from './auth'
import { saveToGlobalConfig } from './config'

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

  await authenticateTarget(targetJson, outputChannel)

  const target = new Target(targetJson)

  await saveToGlobalConfig(target, outputChannel)

  return target
}
