import * as vscode from 'vscode'
import { ExecuteCodeCommand } from './commands/execute-code/ExecuteCodeCommand'
import { ExecutingCodeCommand } from './commands/execute-code/ExecutingCodeCommand'
import { CreateTargetCommand } from './commands/creating-target/createTargetCommand'
import { AuthenticateTargetCommand } from './commands/authenticating-target/authenticateTargetCommand'
import { SelectTargetCommand } from './commands/select-target/selectTargetCommand'
import { FormatCommand } from './commands/format/FormatCommand'
import { lint, clearLintIssues } from './lint/lint'
import { Configuration } from '@sasjs/utils/types'
import { getGlobalConfiguration } from './utils/config'

const eventListeners: vscode.Disposable[] = []
let statusBarItem: vscode.StatusBarItem

export function activate(context: vscode.ExtensionContext) {
  const executeCodeCommand = new ExecuteCodeCommand(context)
  executeCodeCommand.initialise()

  const executingCodeCommand = new ExecutingCodeCommand(context)
  executingCodeCommand.initialise()

  const createTargetCommand = new CreateTargetCommand(context)
  createTargetCommand.initialise()

  const authenticateTargetCommand = new AuthenticateTargetCommand(context)
  authenticateTargetCommand.initialise()

  const selectTargetCommand = new SelectTargetCommand(context)
  selectTargetCommand.initialise()

  const formatCommand = new FormatCommand()
  formatCommand.initialise()

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    1000
  )
  statusBarItem.command = 'sasjs-for-vscode.selectTarget'
  context.subscriptions.push(statusBarItem)

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

  eventListeners.push(
    vscode.workspace.onDidChangeConfiguration(
      () => updateStatusBarItem(),
      null,
      context.subscriptions
    )
  )

  // update status bar item once at start
  updateStatusBarItem()
}

export function deactivate() {
  eventListeners.forEach((listener) => listener.dispose())
}

async function updateStatusBarItem() {
  const extConfig = vscode.workspace.getConfiguration('sasjs-for-vscode')
  const targetFromExt = extConfig.get('target')
  statusBarItem.text = `sasjs: ${(targetFromExt as string) ?? 'none'}`

  if (targetFromExt) {
    const outputChannel = vscode.window.createOutputChannel('SASjs')
    const config = (await getGlobalConfiguration(
      outputChannel
    )) as Configuration
    if (config?.targets?.length) {
      const selectedTarget = config.targets.find(
        (t: any) => t.name === targetFromExt
      )
      if (selectedTarget) {
        statusBarItem.tooltip = `Target Details\nName: ${selectedTarget.name}\nServerUrl: ${selectedTarget.serverUrl}\nServerType: ${selectedTarget.serverType}`
      } else {
        statusBarItem.tooltip = `Target Details\nTarget not found in global .sasjsrc`
      }
    } else {
      statusBarItem.tooltip = `Target Details\nNo Target found in global .sasjsrc`
    }
  } else {
    statusBarItem.tooltip = `No target is selected.`
  }
  statusBarItem.show()
}
