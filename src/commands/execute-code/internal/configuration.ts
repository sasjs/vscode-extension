import { OutputChannel, env, Uri } from 'vscode'

import SASjs from '@sasjs/adapter/node'
import { Target } from '@sasjs/utils/types'
import {
  getAuthCode,
  getChoiceInput,
  getClientId,
  getClientSecret,
  getIsDefault,
  getServerType,
  getServerUrl,
  getTargetName
} from '../../../utils/input'
import { getAuthUrl, getTokens } from '../../../utils/auth'
import {
  getGlobalConfiguration,
  saveToGlobalConfig
} from '../../../utils/config'

export const selectTarget = async (outputChannel: OutputChannel) => {
  const config = await getGlobalConfiguration(outputChannel)

  if (config?.targets?.length) {
    let targetName = config.targets.find((t: Target) => t.isDefault)?.name
    if (!targetName) {
      const targetNames = (config?.targets || []).map((t: any) => t.name)
      targetName = await getChoiceInput(targetNames, 'Please select a target')
    }

    if (!targetName) {
      return
    }

    const selectedTarget = config.targets.find(
      (t: any) => t.name === targetName
    )
    return new Target(selectedTarget)
  } else {
    return await createTarget(outputChannel)
  }
}

export const createTarget = async (outputChannel: OutputChannel) => {
  const name = await getTargetName()
  const serverUrl = await getServerUrl()
  const serverType = await getServerType()
  const clientId = await getClientId()

  const clientSecret = await getClientSecret()

  env.openExternal(Uri.parse(getAuthUrl(serverUrl, clientId)))

  const authCode = await getAuthCode()

  const adapter = new SASjs({
    serverUrl: serverUrl,
    serverType: serverType,
    appLoc: '/Public/app',
    useComputeApi: true,
    debug: true
  })

  const authResponse = await getTokens(
    adapter,
    clientId,
    clientSecret,
    authCode
  )

  const isDefault = await getIsDefault()
  const target = new Target({
    name,
    serverUrl,
    serverType,
    appLoc: '/Public/app',
    authConfig: authResponse,
    isDefault
  })

  await saveToGlobalConfig(target, outputChannel)

  return target
}

export const getAccessToken = async (target: Target) => {
  return target.authConfig?.access_token
}
