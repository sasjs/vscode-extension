import * as vscode from 'vscode'
import { ExecuteCodeCommand } from './commands/execute-code/ExecuteCodeCommand'
import { ExecutingCodeCommand } from './commands/execute-code/ExecutingCodeCommand'
import { lintText } from './lint/lint'

const eventListeners: vscode.Disposable[] = []

export function activate(context: vscode.ExtensionContext) {
  const executeCodeCommand = new ExecuteCodeCommand(context)
  executeCodeCommand.initialise()

  const executingCodeCommand = new ExecutingCodeCommand(context)
  executingCodeCommand.initialise()

  eventListeners.push(
    vscode.workspace.onDidChangeTextDocument(
      (_) => lintText(vscode.window.activeTextEditor),
      null,
      context.subscriptions
    )
  )

  eventListeners.push(
    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        lintText(editor)
      },
      null,
      context.subscriptions
    )
  )
}

export function deactivate() {
  eventListeners.forEach((listener) => listener.dispose())
}
