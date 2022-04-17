import { OutputChannel, env, Uri, workspace } from 'vscode'
import axios from 'axios'

import SASjs from '@sasjs/adapter/node'
import {
  Target,
  Configuration,
  AuthConfig,
  ServerType,
  AuthConfigSas9
} from '@sasjs/utils/types'
import {
  getAllowInsecure,
  getAuthCode,
  getChoiceInput,
  getClientId,
  getClientSecret,
  getIsDefault,
  getServerType,
  getServerUrl,
  getTargetName,
  getUserName,
  getPassword
} from '../../../utils/input'
import { getAuthUrl, getTokens } from '../../../utils/auth'
import {
  getGlobalConfiguration,
  saveGlobalRcFile,
  saveToGlobalConfig
} from '../../../utils/config'

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

export const createTarget = async (outputChannel: OutputChannel) => {
  const name = await getTargetName()
  const serverUrl = await getServerUrl()
  const httpsAgentOptions = (await getAllowInsecure())
    ? { rejectUnauthorized: false }
    : undefined
  const serverType = await getServerType()
  const targetJson: any = {
    name,
    serverUrl,
    serverType,
    appLoc: '/Public/app',
    httpsAgentOptions
  }
  if (serverType === ServerType.SasViya) {
    const clientId = await getClientId()
    const clientSecret = await getClientSecret()

    env.openExternal(Uri.parse(getAuthUrl(serverType, serverUrl, clientId)))

    const authCode = await getAuthCode()

    const adapter = new SASjs({
      serverUrl: serverUrl,
      serverType: serverType,
      appLoc: '/Public/app',
      useComputeApi: true,
      httpsAgentOptions,
      debug: true
    })

    const authResponse = await getTokens(
      adapter,
      clientId,
      clientSecret,
      authCode,
      outputChannel
    )

    targetJson.authConfig = authResponse
  } else if (serverType === ServerType.Sas9) {
    const userName = await getUserName()
    const password = await getPassword()
    targetJson.authConfigSas9 = { userName, password }
  } else if (serverType === ServerType.Sasjs) {
    const res = await axios.get(`${serverUrl}/SASjsApi/info`)
    if (res.data.mode === 'server') {
      const clientId = await getClientId()
      env.openExternal(Uri.parse(getAuthUrl(serverType, serverUrl, clientId)))

      const authCode = await getAuthCode()

      const adapter = new SASjs({
        serverUrl: serverUrl,
        serverType: serverType,
        httpsAgentOptions,
        debug: true
      })

      const authResponse = await getTokens(
        adapter,
        clientId,
        '',
        authCode,
        outputChannel
      )

      targetJson.authConfig = authResponse
    }
  }

  const target = new Target(targetJson)

  await saveToGlobalConfig(target, outputChannel)

  return target
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
    return authConfig
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
