import { window, ExtensionContext, commands, OutputChannel } from 'vscode'
import { selectTarget } from '../../utils/selectTarget'

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
    selectTarget(this.outputChannel).then(() => {
      window.showInformationMessage('Target Selected!')
    })
  }
}
