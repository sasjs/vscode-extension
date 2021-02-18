import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'

import SASjs from '@sasjs/adapter/node'
import { ServerType, Target } from '@sasjs/utils/types'
import { createFile, readFile } from './utils/file'

export const executeCode = async (outputChannel: vscode.OutputChannel) => {
  outputChannel.appendLine('Initialising SASjs.')
  const target = await selectTarget(outputChannel)
  const accessToken = await getAccessToken(target)
  const currentFileContent = isTextSelected()
    ? await vscode.window.activeTextEditor?.document.getText(
        vscode.window.activeTextEditor?.selection
      )
    : await vscode.window.activeTextEditor?.document.getText()

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
      const resultsPath = path.join(
        vscode.workspace.workspaceFolders![0].uri.fsPath,
        'results',
        'test.log'
      )
      await createFile(resultsPath, res.log)
      const document = await vscode.workspace.openTextDocument(resultsPath)
      vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Beside
      })

      outputChannel.append(JSON.stringify(res, null, 2))
      vscode.window.showInformationMessage(
        `Your request has executed successfully! The log is available in ${
          vscode.workspace.workspaceFolders![0].uri.path
        }/results/test.log`,
        { modal: true }
      )
    })
    .catch((e) => {
      outputChannel.append(JSON.stringify(e, null, 2))
    })
}

const getGlobalConfiguration = async (outputChannel: vscode.OutputChannel) => {
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
    vscode.window.showErrorMessage(
      'There was an error parsing your global SASjs config file. Please ensure that the file is valid JSON.',
      { modal: true }
    )

    const document = await vscode.workspace.openTextDocument(sasjsConfigPath)
    await vscode.window.showTextDocument(document)
    return null
  }
}

const selectTarget = async (outputChannel: vscode.OutputChannel) => {
  const config = await getGlobalConfiguration(outputChannel)

  if (config?.targets?.length) {
    const targetNames = (config?.targets || []).map((t: any) => t.name)
    const targetName = await vscode.window.showQuickPick(targetNames, {
      placeHolder: 'Please select a target'
    })

    const selectedTarget = config.targets.find(
      (t: any) => t.name === targetName
    )
    return new Target(selectedTarget)
  } else {
    const name = await vscode.window.showInputBox({
      placeHolder: 'Please enter a name for your target'
    })
    const serverUrl = await vscode.window.showInputBox({
      placeHolder: 'Please enter your SAS server URL'
    })
    const serverType = await vscode.window.showQuickPick(
      ['SAS Viya', 'SAS 9'],
      { placeHolder: 'Please select a server type' }
    )
    const target = new Target({
      name,
      serverUrl,
      serverType:
        serverType === 'SAS Viya' ? ServerType.SasViya : ServerType.Sas9
    })

    return target
  }
}

const getAccessToken = async (target: Target) => {
  return target.authConfig?.access_token
}

const isTextSelected = () => {
  const selection = vscode.window.activeTextEditor?.selection
  return (
    selection &&
    (selection.start.character !== selection.end.character ||
      selection.start.line !== selection.end.line)
  )
}
