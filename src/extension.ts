import * as vscode from 'vscode'
import { ExecuteCodeCommand } from './commands/execute-code/ExecuteCodeCommand'
import { ExecutingCodeCommand } from './commands/execute-code/ExecutingCodeCommand'

export function activate(context: vscode.ExtensionContext) {
  const executeCodeCommand = new ExecuteCodeCommand(context)
  executeCodeCommand.initialise()

  const executingCodeCommand = new ExecutingCodeCommand(context)
  executingCodeCommand.initialise()
}

export function deactivate() {}
