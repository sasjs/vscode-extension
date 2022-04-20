import { OutputChannel, env, Uri, workspace } from 'vscode'
import axios from 'axios'

import SASjs from '@sasjs/adapter/node'
import { decodeFromBase64 } from '@sasjs/utils'
import {
  Target,
  Configuration,
  AuthConfig,
  ServerType,
  AuthConfigSas9
} from '@sasjs/utils/types'
import {
  getAuthCode,
  getChoiceInput,
  getClientId,
  getClientSecret,
  getIsDefault,
  getUserName,
  getPassword
} from '../../../utils/input'
import { getAuthUrl, getTokens } from '../../../utils/auth'
import {
  getGlobalConfiguration,
  saveToGlobalConfig
} from '../../../utils/config'
import { createTarget } from '../../../utils/createTarget'

export const selectTarget = async (outputChannel: OutputChannel) => {
  const config = (await getGlobalConfiguration(outputChannel)) as Configuration

  if (config?.targets?.length) {
    const extConfig = workspace.getConfiguration('sasjs-for-vscode')
    const targetFromExt = extConfig.get('target')
    let inputMessage =
      'Target specified in extension setting is not available in global .sasjsrc file. Please select a target from following list.'
    if (!!targetFromExt) {
      const selectedTarget = config.targets.find(
        (t: any) => t.name === targetFromExt
      )
      if (selectedTarget) {
        return new Target(selectedTarget)
      }
    } else {
      inputMessage =
        'No target is specified in extension setting. Please select a target from following list.'
    }

    const targetNames = (config?.targets || []).map((t: any) => t.name)
    const targetName = await getChoiceInput(
      [...targetNames, 'add and select new target'],
      inputMessage
    )
    if (targetName === 'add and select new target') {
      const target = await createTarget(outputChannel)
      const isDefault = await getIsDefault()
      if (isDefault) {
        await extConfig.update('target', target.name, true)
      }
      return target
    } else if (!!targetName) {
      const isDefault = await getIsDefault()
      if (isDefault) {
        await extConfig.update('target', targetName, true)
      }
      const selectedTarget = config.targets.find(
        (t: any) => t.name === targetName
      )
      return new Target(selectedTarget)
    }
  } else {
    return await createTarget(outputChannel)
  }
}

export const getAuthConfig = async (
  target: Target,
  outputChannel: OutputChannel
) => {
  if (target.serverType === ServerType.Sasjs) {
    const res = await axios.get(`${target.serverUrl}/SASjsApi/info`)
    if (res.data.mode === 'desktop') {
      return
    }
  }
  const authConfig = target.authConfig
  if (authConfig) {
    return authConfig
  }

  const adapter = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType,
    appLoc: '/Public/app',
    useComputeApi: true,
    httpsAgentOptions: target.httpsAgentOptions,
    debug: true
  })

  const clientId = await getClientId()
  let clientSecret = ''
  if (target.serverType === ServerType.SasViya) {
    clientSecret = await getClientSecret()
  }
  env.openExternal(
    Uri.parse(getAuthUrl(target.serverType, target.serverUrl, clientId))
  )
  const authCode = await getAuthCode()

  const authResponse = await getTokens(
    adapter,
    clientId,
    clientSecret,
    authCode,
    outputChannel
  )

  const updatedTarget = new Target({
    ...target.toJson(),
    authConfig: authResponse
  })

  await saveToGlobalConfig(updatedTarget, outputChannel)

  return {
    client: clientId,
    secret: clientSecret,
    access_token: authResponse.access_token,
    refresh_token: authResponse.refresh_token
  } as AuthConfig
}

export const getAuthConfigSas9 = async (
  target: Target,
  outputChannel: OutputChannel
) => {
  const authConfig = target.authConfigSas9
  if (authConfig) {
    return {
      userName: authConfig.userName,
      password: decodeFromBase64(authConfig.password)
    }
  }

  const userName = await getUserName()
  const password = await getPassword()

  const updatedTarget = new Target({
    ...target.toJson(),
    authConfigSas9: { userName, password }
  })

  await saveToGlobalConfig(updatedTarget, outputChannel)

  return {
    userName,
    password
  } as AuthConfigSas9
}
