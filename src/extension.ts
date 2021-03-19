import * as vscode from 'vscode'
import { ExecuteCodeCommand } from './commands/execute-code/ExecuteCodeCommand'
import { ExecutingCodeCommand } from './commands/execute-code/ExecutingCodeCommand'
import { FormatCommand } from './commands/format/FormatCommand'

export function activate(context: vscode.ExtensionContext) {
  const executeCodeCommand = new ExecuteCodeCommand(context)
  executeCodeCommand.initialise()

  const executeCodeNewCommand = new ExecutingCodeCommand(context)
  executeCodeNewCommand.initialise()
}

export function deactivate() {}
