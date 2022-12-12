import { window, ExtensionContext, commands } from 'vscode'
import { configureTarget } from '../../utils/target'

export class SelectTargetCommand {
  constructor(private context: ExtensionContext) {}

  initialise = () => {
    const selectTargetCommand = commands.registerCommand(
      'sasjs-for-vscode.selectTarget',
      () => this.selectTarget()
    )
    this.context.subscriptions.push(selectTargetCommand)
  }

  private selectTarget = async () => {
    configureTarget()
      .then(({ target }) => {
        if (target) {
          window.showInformationMessage(`Selected Target: ${target.name}`)
        }
      })
      .catch((err) => {
        window.showErrorMessage('No target selected!')
        process.outputChannel.appendLine(err.message)
        process.outputChannel.show()
      })
  }
}
