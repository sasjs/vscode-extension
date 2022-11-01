import * as path from 'path'
import * as os from 'os'
import { OutputChannel, window, workspace, env, Uri } from 'vscode'
import SASjs from '@sasjs/adapter/node'
import { decodeFromBase64, encodeToBase64 } from '@sasjs/utils'
import { Target, AuthConfig, ServerType, AuthConfigSas9 } from '@sasjs/utils'
import { createFile, readFile } from './file'
import {
  getChoiceInput,
  getAuthCode,
  getClientId,
  getClientSecret,
  getUserName,
  getPassword
} from './input'
import { getAuthUrl, getTokens } from './auth'
import { isSasJsServerInServerMode } from './utils'

export async function saveToGlobalConfig(
  buildTarget: Target,
  outputChannel: OutputChannel
) {
  let globalConfig = await getGlobalConfiguration(outputChannel)
  const targetJson = buildTarget.toJson()
  if (globalConfig) {
    if (globalConfig.targets && globalConfig.targets.length) {
      const existingTargetIndex = globalConfig.targets.findIndex(
        (t: Target) => t.name === buildTarget.name
      )
      if (existingTargetIndex > -1) {
        globalConfig.targets[existingTargetIndex] = targetJson
      } else {
        globalConfig.targets.push(targetJson)
      }
    } else {
      globalConfig.targets = [targetJson]
    }
  } else {
    globalConfig = { targets: [targetJson] }
  }

  return await saveGlobalRcFile(
    JSON.stringify(globalConfig, null, 2),
    outputChannel
  )
}

export async function removeTargetFromGlobalRcFile(
  outputChannel: OutputChannel
) {
  const globalConfig = await getGlobalConfiguration(outputChannel)

  if (globalConfig) {
    if (!globalConfig?.targets.length) {
      throw new Error('No target found in global config file!')
    }

    const targetNames = (globalConfig?.targets || []).map((t: any) => t.name)
    const targetName = await getChoiceInput(
      [...targetNames],
      'Please select a target you want to delete'
    )

    if (!targetName) {
      throw new Error('No target selected!')
    }
    const targetIndex = globalConfig.targets.findIndex(
      (t: Target) => t.name === targetName
    )
    globalConfig.targets.splice(targetIndex, 1)

    const extConfig = workspace.getConfiguration('sasjs-for-vscode')
    const targetFromExt = extConfig.get('target')

    if (targetFromExt === targetName) {
      await extConfig.update('target', '', true)
    }

    return await saveGlobalRcFile(
      JSON.stringify(globalConfig, null, 2),
      outputChannel
    )
  }
}

export async function saveGlobalRcFile(
  content: string,
  outputChannel: OutputChannel
) {
  const rcFilePath = path.join(os.homedir(), '.sasjsrc')
  outputChannel.appendLine(
    `SASjs: Saving global configuration to ${rcFilePath}`
  )

  await createFile(rcFilePath, content)

  return rcFilePath
}

export const getGlobalConfiguration = async (outputChannel: OutputChannel) => {
  const sasjsConfigPath = path.join(os.homedir(), '.sasjsrc')
  let configFile

  try {
    configFile = await readFile(sasjsConfigPath)
  } catch {
    outputChannel.appendLine(
      'A global SASjs config file was not found in your home directory.'
    )
    return null
  }

  try {
    const configJson = JSON.parse(configFile)
    return configJson
  } catch {
    outputChannel.appendLine(
      'There was an error parsing your global SASjs config file.'
    )
    window.showErrorMessage(
      'There was an error parsing your global SASjs config file (~/.sasjsrc). Please ensure that the file is valid JSON.',
      { modal: true }
    )

    const document = await workspace.openTextDocument(sasjsConfigPath)
    await window.showTextDocument(document)
    return null
  }
}

export const getAuthConfig = async (
  target: Target,
  outputChannel: OutputChannel
) => {
  if (
    target.serverType === ServerType.Sasjs &&
    !(await isSasJsServerInServerMode(target))
  ) {
    return
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

  const defaultClientID =
    target.serverType === ServerType.Sasjs ? 'clientID1' : undefined

  const clientId = await getClientId(defaultClientID)
  let clientSecret = ''
  if (target.serverType === ServerType.SasViya) {
    clientSecret = await getClientSecret()
  }
  const authUrl = Uri.parse(
    getAuthUrl(target.serverType, target.serverUrl, clientId)
  )
  outputChannel.appendLine(authUrl.toString())
  outputChannel.show()
  env.openExternal(authUrl)
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
