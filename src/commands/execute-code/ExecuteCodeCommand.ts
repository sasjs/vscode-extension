import SASjs from '@sasjs/adapter/node'
import { ServerType } from '@sasjs/utils'
import * as os from 'os'
import * as path from 'path'
import {
  window,
  ExtensionContext,
  commands,
  OutputChannel,
  ViewColumn,
  workspace
} from 'vscode'
import { getEditorContent } from '../../utils/editor'
import { createFile } from '../../utils/file'
import {
  selectTarget,
  getAuthConfig,
  getAuthConfigSas9
} from './internal/configuration'
import { getTimestamp } from './internal/utils'

export class ExecuteCodeCommand {
  private outputChannel: OutputChannel

  constructor(private context: ExtensionContext) {
    this.outputChannel = window.createOutputChannel('SASjs')
  }

  initialise = () => {
    const executeCodeCommand = commands.registerCommand(
      'sasjs-for-vscode.executeCode',
      () => this.executeCode()
    )
    this.context.subscriptions.push(executeCodeCommand)
  }

  private executeCode = async () => {
    this.outputChannel.appendLine('Initialising SASjs.')
    const target = await selectTarget(this.outputChannel)
    if (!target) {
      return
    }

    const adapter = new SASjs({
      serverUrl: target.serverUrl,
      serverType: target.serverType,
      appLoc: target.appLoc,
      contextName: target.contextName,
      httpsAgentOptions: target.httpsAgentOptions,
      useComputeApi: true,
      debug: true
    })

    const currentFileContent = getEditorContent()

    if (target.serverType === ServerType.SasViya) {
      const authConfig = await getAuthConfig(target, this.outputChannel)

      await commands.executeCommand('setContext', 'isSasjsCodeExecuting', true)
      adapter
        .executeScriptSASViya(
          'vscode-test-exec',
          (currentFileContent || '').split('\n'),
          '',
          authConfig
        )
        .then(async (res) => {
          this.outputChannel.append('SASjs: Code executed successfully!')
          await createAndOpenLogFile(res.log, this.outputChannel)

          this.outputChannel.append(JSON.stringify(res, null, 2))
          await commands.executeCommand(
            'setContext',
            'isSasjsCodeExecuting',
            false
          )
        })
        .catch(async (e) => handleErrorResponse(e, this.outputChannel))
    } else if (target.serverType === ServerType.Sas9) {
      const { userName, password } = await getAuthConfigSas9(
        target,
        this.outputChannel
      )

      await commands.executeCommand('setContext', 'isSasjsCodeExecuting', true)
      adapter
        .executeScriptSAS9(
          (currentFileContent || '').split('\n'),
          userName,
          password
        )
        .then(async (res) => {
          this.outputChannel.append('SASjs: Code executed successfully!')
          if (res) {
            await createAndOpenLogFile(res, this.outputChannel)
          }
          this.outputChannel.append(JSON.stringify(res, null, 2))
          await commands.executeCommand(
            'setContext',
            'isSasjsCodeExecuting',
            false
          )
        })
        .catch(async (e) => handleErrorResponse(e, this.outputChannel))
    }
  }
}

const createAndOpenLogFile = async (
  log: string,
  outputChannel: OutputChannel
) => {
  const timestamp = getTimestamp()
  const resultsPath = workspace.workspaceFolders?.length
    ? path.join(
        workspace.workspaceFolders![0].uri.fsPath,
        'sasjsresults',
        `${timestamp}.log`
      )
    : path.join(os.homedir(), 'sasjsresults', `${timestamp}.log`)

  outputChannel.appendLine(
    `SASjs: Attempting to create log file at ${resultsPath}.`
  )

  outputChannel.appendLine(`Log content: ${log}`)

  await createFile(resultsPath, log)
  const document = await workspace.openTextDocument(resultsPath)
  window.showTextDocument(document, {
    viewColumn: ViewColumn.Beside
  })
}

const handleErrorResponse = async (e: any, outputChannel: OutputChannel) => {
  outputChannel.append('SASjs: Error executing code: ')
  outputChannel.append(e)
  outputChannel.append(e.message)
  outputChannel.append(JSON.stringify(e, null, 2))

  const { log } = e
  if (log) {
    await createAndOpenLogFile(log, outputChannel)
  }

  await commands.executeCommand('setContext', 'isSasjsCodeExecuting', false)
}
