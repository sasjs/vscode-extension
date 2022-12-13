import { Target } from '@sasjs/utils'
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
import { selectTarget } from '../../utils/target'
import { getTimestamp } from '../../utils/utils'
import { executeCode } from '../../utils/executeCode'

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

    const execFilePath = window.activeTextEditor?.document.fileName

    const sasCodeInjection = `options set=SAS_EXECFILEPATH "${execFilePath}";`

    const currentFileContent = `${sasCodeInjection}\n${getEditorContent()}`

    commands.executeCommand('setContext', 'isSasjsCodeExecuting', true)

    await executeCode(target, currentFileContent || '')
      .then(async ({ log }) => {
        process.outputChannel.appendLine('SASjs: Code executed successfully!')
        await handleSuccessResponse(log)
      })
      .catch(async (err) => {
        await handleErrorResponse(err)
      })
      .finally(() => {
        commands.executeCommand('setContext', 'isSasjsCodeExecuting', false)
      })
  }
}

const createAndOpenLogFile = async (log: string) => {
  const { buildDestinationResultsFolder: resultsFolder } =
    process.sasjsConstants

  const timestamp = getTimestamp()
  const resultsPath = path.join(resultsFolder, `${timestamp}.log`)

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
}

const handleSuccessResponse = async (log: any) => {
  if (typeof log === 'object') {
    return await createAndOpenLogFile(JSON.stringify(log, null, 2))
  }

  if (typeof log === 'string') {
    return await createAndOpenLogFile(log)
  }
}
