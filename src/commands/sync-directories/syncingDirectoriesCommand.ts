import { ExtensionContext, commands } from 'vscode'

export class SyncingDirectoriesCommand {
  constructor(private context: ExtensionContext) {}

  initialise = () => {
    const syncingDirectoriesCommand = commands.registerCommand(
      'sasjs-for-vscode.syncingDirectories',
      () => {}
    )
    this.context.subscriptions.push(syncingDirectoriesCommand)
  }
}
