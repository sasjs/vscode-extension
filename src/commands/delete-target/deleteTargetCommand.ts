import { window, ExtensionContext, commands, OutputChannel } from 'vscode'
import { removeTargetFromGlobalRcFile } from '../../utils/config'
import SASjsChannel from '../../utils/outputChannel'

export class DeleteTargetCommand {
  private outputChannel: OutputChannel

  constructor(private context: ExtensionContext) {
    this.outputChannel = SASjsChannel.getOutputChannel()
  }

  initialise = () => {
    const executingCodeCommand = commands.registerCommand(
      'sasjs-for-vscode.deleteTarget',
      () => this.deleteTarget()
    )
    this.context.subscriptions.push(executingCodeCommand)
  }

  private deleteTarget = async () => {
    removeTargetFromGlobalRcFile(this.outputChannel)
      .then(() => {
        window.showInformationMessage('Target deleted!')
      })
      .catch((err) => window.showErrorMessage(err.toString()))
  }
}
