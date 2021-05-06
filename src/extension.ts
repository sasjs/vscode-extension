import * as vscode from 'vscode'
import { ExecuteCodeCommand } from './commands/execute-code/ExecuteCodeCommand'
import { ExecutingCodeCommand } from './commands/execute-code/ExecutingCodeCommand'
import { FormatCommand } from './commands/format/FormatCommand'
import { lint, clearLintIssues } from './lint/lint'

const eventListeners: vscode.Disposable[] = []

export function activate(context: vscode.ExtensionContext) {
  const executeCodeCommand = new ExecuteCodeCommand(context)
  executeCodeCommand.initialise()

  const executingCodeCommand = new ExecutingCodeCommand(context)
  executingCodeCommand.initialise()

  const formatCommand = new FormatCommand()
  formatCommand.initialise()

  eventListeners.push(
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.languageId === 'sas') {
          lint(vscode.window.activeTextEditor)
        } else {
          clearLintIssues()
        }
      },
      null,
      context.subscriptions
    )
  )

  eventListeners.push(
    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor?.document.languageId === 'sas') {
          lint(editor)
        } else {
          clearLintIssues()
        }
      },
      null,
      context.subscriptions
    )
  )
}

export function deactivate() {
  eventListeners.forEach((listener) => listener.dispose())
}
