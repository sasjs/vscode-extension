import { OutputChannel, env, Uri } from 'vscode'

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
    let targetName = config.targets.find(
      (t) => t.name === config.defaultTarget
    )?.name
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

    env.openExternal(Uri.parse(getAuthUrl(serverUrl, clientId)))

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
  }

  const isDefault = await getIsDefault()
  targetJson.isDefault = isDefault
  const target = new Target(targetJson)

  await saveToGlobalConfig(target, outputChannel)

  if (isDefault) {
    await setTargetAsDefault(name, outputChannel)
  }
  return target
}

export const getAuthConfig = async (
  target: Target,
  outputChannel: OutputChannel
) => {
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
  const clientSecret = await getClientSecret()
  env.openExternal(Uri.parse(getAuthUrl(target.serverUrl, clientId)))
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

const setTargetAsDefault = async (
  targetName: string,
  outputChannel: OutputChannel
) => {
  const globalConfig = await getGlobalConfiguration(outputChannel)
  globalConfig.defaultTarget = targetName
  await saveGlobalRcFile(JSON.stringify(globalConfig, null, 2))
}
