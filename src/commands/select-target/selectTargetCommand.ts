import { window, ExtensionContext, commands, OutputChannel } from 'vscode'
import { configureTarget } from '../../utils/target'

export class SelectTargetCommand {
  private outputChannel: OutputChannel

  constructor(private context: ExtensionContext) {
    this.outputChannel = window.createOutputChannel('SASjs')
  }

  initialise = () => {
    const selectTargetCommand = commands.registerCommand(
      'sasjs-for-vscode.selectTarget',
      () => this.selectTarget()
    )
    this.context.subscriptions.push(selectTargetCommand)
  }

  private selectTarget = async () => {
    configureTarget(this.outputChannel).then((target) => {
      if (target) {
        window.showInformationMessage(`Selected Target: ${target.name}`)
      } else {
        window.showInformationMessage('No target selected!')
      }
    })
  }
}
