import { OutputChannel, env, Uri } from 'vscode'
import axios from 'axios'

import SASjs from '@sasjs/adapter/node'
import { decodeFromBase64, encodeToBase64 } from '@sasjs/utils'
import {
  Target,
  AuthConfig,
  ServerType,
  AuthConfigSas9
} from '@sasjs/utils/types'
import {
  getAuthCode,
  getClientId,
  getClientSecret,
  getUserName,
  getPassword
} from '../../../utils/input'
import { getAuthUrl, getTokens } from '../../../utils/auth'
import { saveToGlobalConfig } from '../../../utils/config'

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
    authConfigSas9: { userName, password: encodeToBase64(password) }
  })

  await saveToGlobalConfig(updatedTarget, outputChannel)

  return {
    userName,
    password
  } as AuthConfigSas9
}
