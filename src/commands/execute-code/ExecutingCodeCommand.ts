import { ExtensionContext, commands } from 'vscode'

export class ExecutingCodeCommand {
  constructor(private context: ExtensionContext) {}

  initialise = () => {
    const executingCodeCommand = commands.registerCommand(
      'sasjs-for-vscode.executingCode',
      () => {}
    )
    this.context.subscriptions.push(executingCodeCommand)
  }
}
