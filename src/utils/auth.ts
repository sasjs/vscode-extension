import * as path from 'path'
import axios from 'axios'
import {
  OutputChannel,
  env,
  Uri,
  workspace,
  QuickPickItem,
  QuickPickItemKind
} from 'vscode'
import SASjs from '@sasjs/adapter/node'
import {
  Configuration,
  encodeToBase64,
  ServerType,
  Target,
  TargetJson
} from '@sasjs/utils'
import {
  getGlobalConfiguration,
  getLocalConfiguration,
  saveToConfigFile
} from './config'
import {
  getAuthCode,
  getClientId,
  getClientSecret,
  getCreateNewTarget,
  getPassword,
  getUserName,
  getTargetChoice
} from './input'
import { createTarget } from './createTarget'
import { createFile } from './file'
import { isSasjsProject } from './utils'

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
  const quickPickChoices: QuickPickItem[] = []
  const globalTargets: TargetJson[] = []
  const localTargets: TargetJson[] = []

  const global = (await getGlobalConfiguration(outputChannel)) as Configuration
  if (global?.targets?.length) {
    globalTargets.push(...global.targets)
    quickPickChoices.push({
      label: 'global',
      kind: QuickPickItemKind.Separator
    })
    global.targets.forEach((t) => {
      quickPickChoices.push({
        label: t.name,
        detail: 'global target'
      })
    })
  }

  if (await isSasjsProject()) {
    const local = (await getLocalConfiguration(outputChannel)) as Configuration
    if (local?.targets?.length) {
      localTargets.push(...local.targets)
      quickPickChoices.push({
        label: 'local',
        kind: QuickPickItemKind.Separator
      })
      local.targets.forEach((t) => {
        quickPickChoices.push({
          label: t.name,
          detail: 'local target'
        })
      })
    }
  }

  if (quickPickChoices.length) {
    const choice = await getTargetChoice(
      quickPickChoices,
      'Please select a target to authenticate'
    )

    let target: Target | undefined
    let isLocal = false

    if (!!choice?.label) {
      if (choice.detail === 'global target') {
        const selectedTarget = globalTargets.find(
          (t) => t.name === choice.label
        )
        const targetJson = await authenticateTarget(
          selectedTarget!,
          false,
          outputChannel
        )
        target = new Target(targetJson)
        await saveToConfigFile(target, false, outputChannel)
      } else {
        const selectedTarget = localTargets.find((t) => t.name === choice.label)
        await authenticateTarget(selectedTarget!, true, outputChannel)
        target = new Target(selectedTarget)
        isLocal = true
      }
    }

    const extConfig = workspace.getConfiguration('sasjs-for-vscode')
    await extConfig.update('target', target?.name)
    await extConfig.update('isLocal', isLocal)
    return target
  } else if (await getCreateNewTarget()) {
    return await createTarget(outputChannel)
  }
}

export const authenticateTarget = async (
  targetJson: TargetJson,
  isLocal: boolean,
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
    if (isLocal) {
      const envFileContent = `SAS_USERNAME=${userName}\nSAS_PASSWORD=${encodeToBase64(
        password
      )}\n`
      const envFilePath = path.join(
        workspace.workspaceFolders![0].uri.fsPath,
        `.env.${targetJson.name}`
      )
      await createFile(envFilePath, envFileContent)
    } else {
      targetJson.authConfigSas9 = {
        userName,
        password: encodeToBase64(password)
      }
    }

    return targetJson
  }

  const adapter = new SASjs({
    serverUrl: targetJson.serverUrl,
    serverType: targetJson.serverType
  })

  const defaultClientID =
    targetJson.serverType === ServerType.Sasjs ? 'clientID1' : undefined

  const clientId = await getClientId(defaultClientID)
  const clientSecret =
    targetJson.serverType === ServerType.SasViya ? await getClientSecret() : ''

  const authUrl = Uri.parse(
    getAuthUrl(targetJson.serverType, targetJson.serverUrl, clientId)
  )
  env.openExternal(authUrl)

  const authCode = await getAuthCode()

  const authConfig = (await getTokens(
    adapter,
    clientId,
    clientSecret,
    authCode,
    outputChannel
  )) as any

  if (isLocal) {
    const envFileContent = `CLIENT=${authConfig.client}\nSECRET=${authConfig.secret}\nACCESS_TOKEN=${authConfig.access_token}\nREFRESH_TOKEN=${authConfig.refresh_token}\n`
    const envFilePath = path.join(
      workspace.workspaceFolders![0].uri.fsPath,
      `.env.${targetJson.name}`
    )
    return await createFile(envFilePath, envFileContent)
  }

  targetJson.authConfig = authConfig

  return targetJson
}
