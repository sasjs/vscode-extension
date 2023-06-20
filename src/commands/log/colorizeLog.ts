import { ExtensionContext, commands } from 'vscode'

export class ColorizeLogCommand {
  constructor(private context: ExtensionContext) {}

  initialise = () => {
    const colorizeLog = commands.registerCommand(
      'sasjs-for-vscode.colorizeLog',
      () => this.colorizeLog()
    )

    this.context.subscriptions.push(colorizeLog)
  }

  private colorizeLog = async () => {
    console.log(`🤖[colorizeLog]🤖`)
  }
}
