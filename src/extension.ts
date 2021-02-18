import * as vscode from 'vscode'
import { executeCode } from './executeCode'

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('SASjs')

  const executeCodeCommand = vscode.commands.registerCommand(
    'sasjs-for-vscode.executeCode',
    () => executeCode(outputChannel)
  )

  context.subscriptions.push(executeCodeCommand)
}

export function deactivate() {}
