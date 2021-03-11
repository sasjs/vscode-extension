import SASjs from '@sasjs/adapter/node'
import * as os from 'os'
import * as path from 'path'
import {
  window,
  ExtensionContext,
  commands,
  StatusBarAlignment,
  OutputChannel,
  ViewColumn,
  workspace,
  StatusBarItem
} from 'vscode'
import { getEditorContent } from '../../utils/editor'
import { createFile } from '../../utils/file'
import { selectTarget, getAccessToken } from './internal/configuration'
import { getTimestamp } from './internal/utils'

export class ExecuteCodeCommand {
  private outputChannel: OutputChannel
  private runSasCodeButton: StatusBarItem

  constructor(private context: ExtensionContext) {
    this.outputChannel = window.createOutputChannel('SASjs')
  }

  initialise = () => {
    const executeCodeCommand = commands.registerCommand(
      'sasjs-for-vscode.executeCode',
      () => this.executeCode()
    )
    this.context.subscriptions.push(executeCodeCommand)

    this.initialiseRunSasCodeButton()
  }

  private initialiseRunSasCodeButton = () => {
    this.runSasCodeButton = window.createStatusBarItem(
      StatusBarAlignment.Right,
      100
    )
    this.runSasCodeButton.text = '$(notebook-execute) Run SAS code'
    this.runSasCodeButton.command = 'sasjs-for-vscode.executeCode'
    this.runSasCodeButton.show()
    this.context.subscriptions.push(this.runSasCodeButton)
  }

  private executeCode = async () => {
    this.outputChannel.appendLine('Initialising SASjs.')
    const target = await selectTarget(this.outputChannel)
    if (!target) {
      return
    }
    const accessToken = await getAccessToken(target, this.outputChannel)
    const currentFileContent = getEditorContent()

    const adapter = new SASjs({
      serverUrl: target.serverUrl,
      serverType: target.serverType,
      appLoc: target.appLoc,
      contextName: target.contextName,
      useComputeApi: true,
      debug: true
    })

    this.runSasCodeButton.text = '$(sync~spin) Running your SAS code'
    adapter
      .executeScriptSASViya(
        'vscode-test-exec',
        (currentFileContent || '').split('\n'),
        '',
        accessToken
      )
      .then(async (res) => {
        this.runSasCodeButton.text =
          '$(notebook-state-success) SAS code executed successfully!'

        const timeout = setTimeout(() => {
          this.runSasCodeButton.text = '$(notebook-execute) Run SAS code'
          clearTimeout(timeout)
        }, 3000)
        await createAndOpenLogFile(res.log)

        this.outputChannel.append(JSON.stringify(res, null, 2))
      })
      .catch(async (e) => {
        const { log } = e
        await createAndOpenLogFile(log)

        this.runSasCodeButton.text =
          '$(notebook-state-error) SAS code execution failed'
        const timeout = setTimeout(() => {
          this.runSasCodeButton.text = '$(notebook-execute) Run SAS code'
          clearTimeout(timeout)
        }, 3000)
        this.outputChannel.append(JSON.stringify(e, null, 2))
      })
  }
}

const createAndOpenLogFile = async (log: string) => {
  const timestamp = getTimestamp()
  const resultsPath = workspace.workspaceFolders?.length
    ? path.join(
        workspace.workspaceFolders![0].uri.fsPath,
        'sasjsresults',
        `${timestamp}.log`
      )
    : path.join(os.homedir(), 'sasjsresults', `${timestamp}.log`)
  await createFile(resultsPath, log)
  const document = await workspace.openTextDocument(resultsPath)
  window.showTextDocument(document, {
    viewColumn: ViewColumn.Beside
  })
}
