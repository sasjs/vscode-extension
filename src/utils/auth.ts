import axios from 'axios'
import { OutputChannel, env, Uri, workspace } from 'vscode'
import SASjs from '@sasjs/adapter/node'
import {
  Configuration,
  encodeToBase64,
  ServerType,
  Target,
  TargetJson
} from '@sasjs/utils'
import { getGlobalConfiguration, saveToGlobalConfig } from './config'
import {
  getAuthCode,
  getClientId,
  getClientSecret,
  getChoiceInput,
  getCreateNewTarget,
  getPassword,
  getUserName
} from './input'
import { createTarget } from './createTarget'

export const getTokens = async (
  sasjsInstance: SASjs,
  clientId: string,
  clientSecret: string,
  authCode: string,
  outputChannel: OutputChannel
) => {
  outputChannel.appendLine(
    `Attempting to get access token with client ${clientId} and auth code ${authCode}`
  )
  const authResponse = await sasjsInstance
    .getAccessToken(clientId, clientSecret, authCode)
    .catch((e) => {
      outputChannel.appendLine(
        `Error getting access tokens: ${e?.message || e}`
      )

      throw e
    })

  return authResponse
}

export const getAuthUrl = (
  serverType: ServerType,
  serverUrl: string,
  clientId: string
) =>
  serverType === ServerType.Sasjs
    ? `${serverUrl}/#/SASjsLogon?client_id=${clientId}&response_type=code`
    : `${serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`

export const selectAndAuthenticateTarget = async (
  outputChannel: OutputChannel
) => {
  const config = (await getGlobalConfiguration(outputChannel)) as Configuration

  if (config?.targets?.length) {
    const targetNames = (config?.targets || []).map((t: any) => t.name)
    const targetName = await getChoiceInput(
      [...targetNames],
      'Please select a target to authenticate'
    )

    if (!!targetName) {
      const targetJson = config.targets.find((t: any) => t.name === targetName)
      await authenticateTarget(targetJson!, outputChannel)
      const target = new Target(targetJson)
      await saveToGlobalConfig(target, outputChannel)
      const extConfig = workspace.getConfiguration('sasjs-for-vscode')
      await extConfig.update('target', target.name, true)
      return target
    }
  } else if (await getCreateNewTarget()) {
    return await createTarget(outputChannel)
  }
}

export const authenticateTarget = async (
  targetJson: TargetJson,
  outputChannel: OutputChannel
) => {
  if (targetJson.serverType === ServerType.Sasjs) {
    const res = await axios.get(`${targetJson.serverUrl}/SASjsApi/info`)
    // if sasjs server is not running in server mode then no need to authenticate
    if (res.data?.mode !== 'server') {
      return targetJson
    }
  }

  if (targetJson.serverType === ServerType.Sas9) {
    const userName = await getUserName()
    const password = await getPassword()
    targetJson.authConfigSas9 = { userName, password: encodeToBase64(password) }
    return targetJson
  }

  const adapter =
    targetJson.serverType === ServerType.SasViya ||
    targetJson.serverType === ServerType.Sasjs
      ? new SASjs({
          serverUrl: targetJson.serverUrl,
          serverType: targetJson.serverType,
          appLoc: '/Public/app'
        })
      : undefined

  const clientId = await getClientId()
  const clientSecret =
    targetJson.serverType === ServerType.SasViya ? await getClientSecret() : ''

  const authUrl = Uri.parse(
    getAuthUrl(targetJson.serverType, targetJson.serverUrl, clientId)
  )
  env.openExternal(authUrl)

  const authCode = await getAuthCode()

  targetJson.authConfig = (await getTokens(
    adapter!,
    clientId,
    clientSecret,
    authCode,
    outputChannel
  )) as any

  return targetJson
}
