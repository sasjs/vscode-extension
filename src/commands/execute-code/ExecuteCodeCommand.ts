import { window, ExtensionContext, commands } from 'vscode'
import { getEditorContent } from '../../utils/editor'
import {
  createAndOpenLogFile,
  handleErrorResponse,
  getTimestamp
} from '../../utils/utils'
import { executeCode } from '../../utils/executeCode'
import { TargetCommand } from '../../types/commands/targetCommand'
import { ScriptExecutionResult } from '@sasjs/adapter'
import { createFile, createFolder } from '../../utils/file'
import * as path from 'path'

interface ExecutionArtifacts extends ScriptExecutionResult {
  code?: string
}

export class ExecuteCodeCommand extends TargetCommand {
  constructor(private context: ExtensionContext) {
    super()
  }

  initialise = () => {
    const executeCodeCommand = commands.registerCommand(
      'sasjs-for-vscode.executeCode',
      () => this.executeCode()
    )
    this.context.subscriptions.push(executeCodeCommand)
  }

  private executeCode = async () => {
    process.outputChannel.appendLine('Initialising SASjs.')

    const { target } = await this.getTargetInfo()

    if (!target) {
      return
    }

    const execFilePath = window.activeTextEditor?.document.fileName
    const sasCodeInjection = `options set=SAS_EXECFILEPATH "${execFilePath}";`
    const editorContent = getEditorContent()
    const currentFileContent = `${sasCodeInjection}\n${editorContent}`

    commands.executeCommand('setContext', 'isSasjsCodeExecuting', true)

    await executeCode(target, currentFileContent || '')
      .then(async (res) => {
        if (typeof res.log === 'object') {
          res.log = JSON.stringify(res.log, null, 2)
        }

        await this.saveExecutionArtifacts({ ...res, code: editorContent })

        process.outputChannel.appendLine('SASjs: Code executed successfully!')
      })
      .catch(async (err) => {
        await handleErrorResponse(err, 'Error executing code')
      })
      .finally(() => {
        commands.executeCommand('setContext', 'isSasjsCodeExecuting', false)
      })
  }

  private saveExecutionArtifacts = async (result: ExecutionArtifacts) => {
    const { buildDestinationResultsFolder: resultsFolder } =
      process.sasjsConstants
    const timestamp = getTimestamp()
    const folderPath = path.join(resultsFolder, timestamp)

    await createFolder(folderPath)

    const { log, webout, printOutput, code } = result

    if (webout) {
      await createFile(path.join(folderPath, 'webout.txt'), webout)
    }
    if (printOutput) {
      await createFile(path.join(folderPath, 'print.lst'), printOutput)
    }
    if (code) {
      await createFile(path.join(folderPath, 'code.sas'), code)
    }

    await createAndOpenLogFile(log, path.join(folderPath, 'log.log'))
  }
}
