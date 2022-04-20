import { window, ExtensionContext, commands, OutputChannel } from 'vscode'
import { createTarget } from '../../utils/createTarget'

export class CreateTargetCommand {
  private outputChannel: OutputChannel

  constructor(private context: ExtensionContext) {
    this.outputChannel = window.createOutputChannel('SASjs')
  }

  initialise = () => {
    const executingCodeCommand = commands.registerCommand(
      'sasjs-for-vscode.createTarget',
      () => this.createTarget()
    )
    this.context.subscriptions.push(executingCodeCommand)
  }

  private createTarget = async () => {
    createTarget(this.outputChannel).then(() => {
      window.showInformationMessage('Target created!')
    })
  }
}
