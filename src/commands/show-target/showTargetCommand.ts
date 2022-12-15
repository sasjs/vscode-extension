import { window, ExtensionContext, commands } from 'vscode'
import { openTargetFile } from '../../utils/utils'

export class ShowTargetCommand {
  constructor(private context: ExtensionContext) {}

  initialise = () => {
    const selectTargetCommand = commands.registerCommand(
      'sasjs-for-vscode.showTarget',
      () => this.execute()
    )
    this.context.subscriptions.push(selectTargetCommand)
  }

  private execute = async () => {
    openTargetFile().catch((err) => {
      window.showErrorMessage('No target selected!')
      process.outputChannel.appendLine(err.message)
      process.outputChannel.show()
    })
  }
}
