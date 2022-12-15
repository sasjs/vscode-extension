import { window, ExtensionContext, commands } from 'vscode'
import { removeTargetFromGlobalRcFile } from '../../utils/config'

export class DeleteTargetCommand {
  constructor(private context: ExtensionContext) {}

  initialise = () => {
    const executingCodeCommand = commands.registerCommand(
      'sasjs-for-vscode.deleteTarget',
      () => this.deleteTarget()
    )
    this.context.subscriptions.push(executingCodeCommand)
  }

  private deleteTarget = async () => {
    removeTargetFromGlobalRcFile()
      .then(() => {
        window.showInformationMessage('Target deleted!')
      })
      .catch((err) => window.showErrorMessage(err.toString()))
  }
}
