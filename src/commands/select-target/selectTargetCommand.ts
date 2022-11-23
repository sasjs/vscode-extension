import { window, ExtensionContext, commands, OutputChannel } from 'vscode'
import { configureTarget } from '../../utils/target'
import SASjsChannel from '../../utils/outputChannel'

export class SelectTargetCommand {
  private outputChannel: OutputChannel

  constructor(private context: ExtensionContext) {
    this.outputChannel = SASjsChannel.getOutputChannel()
  }

  initialise = () => {
    const selectTargetCommand = commands.registerCommand(
      'sasjs-for-vscode.selectTarget',
      () => this.selectTarget()
    )
    this.context.subscriptions.push(selectTargetCommand)
  }

  private selectTarget = async () => {
    configureTarget(this.outputChannel)
      .then(({ target }) => {
        if (target) {
          window.showInformationMessage(`Selected Target: ${target.name}`)
        }
      })
      .catch((err) => {
        window.showErrorMessage('No target selected!')
        this.outputChannel.appendLine(err.message)
        this.outputChannel.show()
      })
  }
}
