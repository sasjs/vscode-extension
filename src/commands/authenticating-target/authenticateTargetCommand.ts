import { window, ExtensionContext, commands, OutputChannel } from 'vscode'
import { selectAndAuthenticateTarget } from '../../utils/auth'

export class AuthenticateTargetCommand {
  private outputChannel: OutputChannel

  constructor(private context: ExtensionContext) {
    this.outputChannel = window.createOutputChannel('SASjs')
  }

  initialise = () => {
    const authenticateTargetCommand = commands.registerCommand(
      'sasjs-for-vscode.authenticateTarget',
      () => this.authenticateTarget()
    )
    this.context.subscriptions.push(authenticateTargetCommand)
  }

  private authenticateTarget = async () => {
    selectAndAuthenticateTarget(this.outputChannel).then((target) => {
      if (target) {
        window.showInformationMessage('Target authenticated!')
      }
    })
  }
}
