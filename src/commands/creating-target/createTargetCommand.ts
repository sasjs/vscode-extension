import { window, ExtensionContext, commands } from 'vscode'
import { createTarget } from '../../utils/createTarget'

export class CreateTargetCommand {
  constructor(private context: ExtensionContext) {}

  initialise = () => {
    const executingCodeCommand = commands.registerCommand(
      'sasjs-for-vscode.createTarget',
      () => this.createTarget()
    )
    this.context.subscriptions.push(executingCodeCommand)
  }

  private createTarget = async () => {
    createTarget().then(() => {
      window.showInformationMessage('Target created!')
    })
  }
}
