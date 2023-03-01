import { window, ExtensionContext, commands } from 'vscode'
import { getEditorContent } from '../../utils/editor'
import { selectTarget } from '../../utils/target'
import { createAndOpenLogFile, handleErrorResponse } from '../../utils/utils'
import { executeCode } from '../../utils/executeCode'
import { updateSasjsConstants } from '../../utils/setConstants'
import { TargetCommand } from '../../types/commands/targetCommand'

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

    const currentFileContent = `${sasCodeInjection}\n${getEditorContent()}`

    commands.executeCommand('setContext', 'isSasjsCodeExecuting', true)

    await executeCode(target, currentFileContent || '')
      .then(async ({ log }) => {
        process.outputChannel.appendLine('SASjs: Code executed successfully!')
        await handleSuccessResponse(log)
      })
      .catch(async (err) => {
        await handleErrorResponse(err, 'Error executing code')
      })
      .finally(() => {
        commands.executeCommand('setContext', 'isSasjsCodeExecuting', false)
      })
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
