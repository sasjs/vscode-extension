import * as vscode from 'vscode'
import { ExecuteCodeCommand } from './commands/execute-code/ExecuteCodeCommand'

export function activate(context: vscode.ExtensionContext) {
  const executeCodeCommand = new ExecuteCodeCommand(context)
  executeCodeCommand.initialise()
}

export function deactivate() {}
