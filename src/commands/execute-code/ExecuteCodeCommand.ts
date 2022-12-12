import SASjs from '@sasjs/adapter/node'
import { ServerType, Target } from '@sasjs/utils'
import * as os from 'os'
import * as path from 'path'
import {
  window,
  ExtensionContext,
  commands,
  ViewColumn,
  workspace
} from 'vscode'
import { getEditorContent } from '../../utils/editor'
import { createFile } from '../../utils/file'
import { getAuthConfig, getAuthConfigSas9 } from '../../utils/config'
import { selectTarget } from '../../utils/target'
import { getTimestamp } from '../../utils/utils'

export class ExecuteCodeCommand {
  constructor(private context: ExtensionContext) {}

  initialise = () => {
    const executeCodeCommand = commands.registerCommand(
      'sasjs-for-vscode.executeCode',
      () => this.executeCode()
    )
    this.context.subscriptions.push(executeCodeCommand)
  }

  private executeCode = async () => {
    process.outputChannel.appendLine('Initialising SASjs.')
    let target: Target | undefined

    try {
      ;({ target } = await selectTarget())
    } catch (error: any) {
      process.outputChannel.appendLine('SASjs: Error selecting target: ')
      process.outputChannel.appendLine(error)
      process.outputChannel.appendLine(error.message)
      process.outputChannel.appendLine(JSON.stringify(error, null, 2))
      process.outputChannel.show()
    }

    if (!target) {
      window.showErrorMessage(
        'An unexpected error occurred while selecting target.'
      )
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

    const execFilePath = window.activeTextEditor?.document.fileName

    const sasCodeInjection = `options set=SAS_EXECFILEPATH "${execFilePath}";`

    const currentFileContent = `${sasCodeInjection}\n${getEditorContent()}`

    if (target.serverType === ServerType.SasViya) {
      const authConfig = await getAuthConfig(target)

      await commands.executeCommand('setContext', 'isSasjsCodeExecuting', true)
      adapter
        .executeScript({
          fileName: 'vscode-test-exec',
          linesOfCode: (currentFileContent || '').split('\n'),
          contextName: '',
          authConfig
        })
        .then(async (res) => handleSuccessResponse(res))
        .catch(async (e) => handleErrorResponse(e))
    } else if (target.serverType === ServerType.Sas9) {
      const { userName, password } = await getAuthConfigSas9(target)

      await commands.executeCommand('setContext', 'isSasjsCodeExecuting', true)
      adapter
        .executeScript({
          linesOfCode: (currentFileContent || '').split('\n'),
          authConfigSas9: { userName, password }
        })
        .then(async (res) => handleSuccessResponse(res))
        .catch(async (e) => handleErrorResponse(e))
    } else if (target.serverType === ServerType.Sasjs) {
      const authConfig = await getAuthConfig(target)
      await commands.executeCommand('setContext', 'isSasjsCodeExecuting', true)
      adapter
        .executeScript({
          linesOfCode: (currentFileContent || '').split('\n'),
          runTime: 'sas',
          authConfig
        })
        .then(async (res) => handleSuccessResponse(res))
        .catch(async (e) => handleErrorResponse(e))
    }
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

  process.outputChannel.appendLine(
    `SASjs: Attempting to create log file at ${resultsPath}.`
  )

  process.outputChannel.show()

  await createFile(resultsPath, log)
  const document = await workspace.openTextDocument(resultsPath)
  window.showTextDocument(document, {
    viewColumn: ViewColumn.Beside
  })
}

const handleErrorResponse = async (e: any) => {
  process.outputChannel.appendLine('SASjs: Error executing code: ')
  process.outputChannel.appendLine(e)
  process.outputChannel.appendLine(e.message)
  process.outputChannel.appendLine(JSON.stringify(e, null, 2))
  process.outputChannel.show()

  const { log } = e
  if (log) {
    await createAndOpenLogFile(log)
  } else if (e.message) {
    await createAndOpenLogFile(e.message)
  }

  await commands.executeCommand('setContext', 'isSasjsCodeExecuting', false)
}

const handleSuccessResponse = async (res: any) => {
  process.outputChannel.appendLine('SASjs: Code executed successfully!')
  if (typeof res === 'object') {
    await createAndOpenLogFile(JSON.stringify(res, null, 2))
  } else if (typeof res === 'string') {
    await createAndOpenLogFile(res)
  }
  await commands.executeCommand('setContext', 'isSasjsCodeExecuting', false)
}
