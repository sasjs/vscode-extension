import * as vscode from 'vscode'
import SASjs from '@sasjs/adapter/node'
import { executeCode } from './executeCode'

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('SASjs')
  const adapter = new SASjs({
    serverUrl: 'https://sas.analytium.co.uk',
    serverType: 'SASVIYA',
    appLoc: '/Public/app/react-seed-app',
    contextName: 'SAS Job Execution compute context',
    useComputeApi: true,
    debug: true
  })

  const executeCodeCommand = vscode.commands.registerCommand(
    'sasjs-vscode-extension.executeCode',
    () => executeCode(adapter, outputChannel)
  )

  context.subscriptions.push(executeCodeCommand)
}

export function deactivate() {}
