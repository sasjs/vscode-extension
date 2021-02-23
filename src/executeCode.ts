import { OutputChannel, window, workspace, env, Uri, ViewColumn } from 'vscode'
import * as path from 'path'

import SASjs from '@sasjs/adapter/node'
import { Target } from '@sasjs/utils/types'
import { timestampToYYYYMMDDHHMMSS } from '@sasjs/utils/time'
import { createFile } from './utils/file'
import {
  getAuthCode,
  getChoiceInput,
  getClientId,
  getClientSecret,
  getServerType,
  getServerUrl,
  getTargetName
} from './utils/input'
import { getAuthUrl, getTokens } from './utils/auth'
import { getEditorContent } from './utils/editor'
import { getGlobalConfiguration, saveToGlobalConfig } from './utils/config'

export const executeCode = async (outputChannel: OutputChannel) => {
  outputChannel.appendLine('Initialising SASjs.')
  const target = await selectTarget(outputChannel)
  const accessToken = await getAccessToken(target)
  const currentFileContent = getEditorContent()

  const adapter = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType,
    appLoc: target.appLoc,
    contextName: target.contextName,
    useComputeApi: true,
    debug: true
  })

  adapter
    .executeScriptSASViya(
      'vscode-test-exec',
      (currentFileContent || '').split('\n'),
      '',
      accessToken
    )
    .then(async (res) => {
      const timestamp = timestampToYYYYMMDDHHMMSS()
        .replace(/ /g, '')
        .replace(/\//g, '')
        .replace(/:/g, '')
      const resultsPath = path.join(
        workspace.workspaceFolders![0].uri.fsPath,
        'results',
        `${timestamp}.log`
      )
      await createFile(resultsPath, res.log)
      const document = await workspace.openTextDocument(resultsPath)
      window.showTextDocument(document, {
        viewColumn: ViewColumn.Beside
      })

      outputChannel.append(JSON.stringify(res, null, 2))
      window.showInformationMessage(
        `Your request has executed successfully! The log is available in ${
          workspace.workspaceFolders![0].uri.path
        }/results/test.log`,
        { modal: true }
      )
    })
    .catch((e) => {
      outputChannel.append(JSON.stringify(e, null, 2))
    })
}

const selectTarget = async (outputChannel: OutputChannel) => {
  const config = await getGlobalConfiguration(outputChannel)

  if (config?.targets?.length) {
    const targetNames = (config?.targets || []).map((t: any) => t.name)
    const targetName = await getChoiceInput(
      targetNames,
      'Please select a target'
    )

    const selectedTarget = config.targets.find(
      (t: any) => t.name === targetName
    )
    return new Target(selectedTarget)
  } else {
    return await createTarget(outputChannel)
  }
}

const createTarget = async (outputChannel: OutputChannel) => {
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

  const target = new Target({
    name,
    serverUrl,
    serverType,
    appLoc: '/Public/app',
    authConfig: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      access_token: authResponse.access_token,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      refresh_token: authResponse.refresh_token
    }
  })

  await saveToGlobalConfig(target, outputChannel)

  return target
}

const getAccessToken = async (target: Target) => {
  return target.authConfig?.access_token
}
