import { window, ExtensionContext, commands, OutputChannel } from 'vscode'
import { openTargetFile } from '../../utils/utils'
import SASjsChannel from '../../utils/outputChannel'

export class ShowTargetCommand {
  private outputChannel: OutputChannel

  constructor(private context: ExtensionContext) {
    this.outputChannel = SASjsChannel.getOutputChannel()
  }

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
      this.outputChannel.appendLine(err.message)
      this.outputChannel.show()
    })
  }
}
