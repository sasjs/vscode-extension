import { window, ExtensionContext, commands } from 'vscode'
import { selectAndAuthenticateTarget } from '../../utils/auth'

export class AuthenticateTargetCommand {
  constructor(private context: ExtensionContext) {}

  initialise = () => {
    const authenticateTargetCommand = commands.registerCommand(
      'sasjs-for-vscode.authenticateTarget',
      () => this.authenticateTarget()
    )
    this.context.subscriptions.push(authenticateTargetCommand)
  }

  private authenticateTarget = async () => {
    selectAndAuthenticateTarget().then((target) => {
      if (target) {
        window.showInformationMessage('Target authenticated!')
      }
    })
  }
}
