import { workspace } from 'vscode'
import { setConstants } from './setConstants'
import SASjsChannel from './outputChannel'

export const setProcessVariables = async () => {
  process.outputChannel = SASjsChannel.getOutputChannel()
  process.projectDir = workspace.workspaceFolders![0].uri.fsPath
  await setConstants()
}
