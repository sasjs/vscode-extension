import * as path from 'path'
import axios from 'axios'
import { env, Uri, workspace, QuickPickItem, QuickPickItemKind } from 'vscode'
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
  getTargetChoice,
  getServerUrl
} from './input'
import { createTarget } from './createTarget'
import { createFile } from './file'
import { setConstants } from './setConstants'

export const getTokens = async (
  sasjsInstance: SASjs,
  clientId: string,
  clientSecret: string,
  authCode: string
) => {
  process.outputChannel.appendLine(
    `Attempting to get access token with client ${clientId} and auth code ${authCode}`
  )
  const authResponse = await sasjsInstance
    .getAccessToken(clientId, clientSecret, authCode)
    .catch((e) => {
      process.outputChannel.appendLine(
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

export const selectAndAuthenticateTarget = async () => {
  const quickPickChoices: QuickPickItem[] = []
  const globalTargets: TargetJson[] = []
  const localTargets: TargetJson[] = []

  const global = (await getGlobalConfiguration()) as Configuration
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

  if (process.isSasjsProject) {
    const local = (await getLocalConfiguration()) as Configuration
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
        const targetJson = await authenticateTarget(selectedTarget!, false)
        target = new Target(targetJson)
        await saveToConfigFile(target, false)
      } else {
        const selectedTarget = localTargets.find((t) => t.name === choice.label)
        const targetJson = await authenticateTarget(selectedTarget!, true)
        target = new Target(targetJson)
        isLocal = true
        await saveToConfigFile(target, true)
      }
    }

    const extConfig = workspace.getConfiguration('sasjs-for-vscode')
    await extConfig.update('target', target?.name, true)
    await extConfig.update('isLocal', isLocal, true)
    await setConstants()
    return target
  } else if (await getCreateNewTarget()) {
    const { target } = await createTarget()
    return target
  }
}

export const authenticateTarget = async (
  targetJson: TargetJson,
  isLocal: boolean
) => {
  if (!targetJson.serverUrl) {
    targetJson.serverUrl = await getServerUrl()
  }

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
    authCode
  )) as any

  if (isLocal) {
    const envFileContent = `CLIENT=${clientId}\nSECRET=${clientSecret}\nACCESS_TOKEN=${authConfig.access_token}\nREFRESH_TOKEN=${authConfig.refresh_token}\n`
    const envFilePath = path.join(
      workspace.workspaceFolders![0].uri.fsPath,
      `.env.${targetJson.name}`
    )
    await createFile(envFilePath, envFileContent)
    return targetJson
  }

  targetJson.authConfig = authConfig

  return targetJson
}
