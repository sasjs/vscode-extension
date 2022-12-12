import * as vscode from 'vscode'
import { ExecuteCodeCommand } from './commands/execute-code/ExecuteCodeCommand'
import { ExecutingCodeCommand } from './commands/execute-code/ExecutingCodeCommand'
import { SyncDirectoriesCommand } from './commands/sync-directories/syncDirectoriesCommand'
import { SyncingDirectoriesCommand } from './commands/sync-directories/syncingDirectoriesCommand'
import { CreateTargetCommand } from './commands/creating-target/createTargetCommand'
import { DeleteTargetCommand } from './commands/delete-target/deleteTargetCommand'
import { AuthenticateTargetCommand } from './commands/authenticating-target/authenticateTargetCommand'
import { SelectTargetCommand } from './commands/select-target/selectTargetCommand'
import { ShowTargetCommand } from './commands/show-target/showTargetCommand'
import { FormatCommand } from './commands/format/FormatCommand'
import { lint, clearLintIssues } from './lint/lint'
import { Configuration } from '@sasjs/utils/types'
import { getGlobalConfiguration, getLocalConfiguration } from './utils/config'
import { setProcessVariables } from './utils/setProcessVariables'

const eventListeners: vscode.Disposable[] = []
let statusBarItem: vscode.StatusBarItem

export function activate(context: vscode.ExtensionContext) {
  setProcessVariables()

  const executeCodeCommand = new ExecuteCodeCommand(context)
  executeCodeCommand.initialise()

  const executingCodeCommand = new ExecutingCodeCommand(context)
  executingCodeCommand.initialise()

  const syncDirectoriesCommand = new SyncDirectoriesCommand(context)
  syncDirectoriesCommand.initialise()

  const syncingDirectoriesCommand = new SyncingDirectoriesCommand(context)
  syncingDirectoriesCommand.initialise()

  const createTargetCommand = new CreateTargetCommand(context)
  createTargetCommand.initialise()

  const deleteTargetCommand = new DeleteTargetCommand(context)
  deleteTargetCommand.initialise()

  const authenticateTargetCommand = new AuthenticateTargetCommand(context)
  authenticateTargetCommand.initialise()

  const selectTargetCommand = new SelectTargetCommand(context)
  selectTargetCommand.initialise()

  const showTargetCommand = new ShowTargetCommand(context)
  showTargetCommand.initialise()

  const formatCommand = new FormatCommand()
  formatCommand.initialise()

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    1000
  )
  statusBarItem.command = 'sasjs-for-vscode.showTarget'
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
      () => configurationChangeHandler(),
      null,
      context.subscriptions
    )
  )

  // invoke configuration change handler once at start
  configurationChangeHandler()
}

export function deactivate() {
  eventListeners.forEach((listener) => listener.dispose())
}

async function configurationChangeHandler() {
  const extConfig = vscode.workspace.getConfiguration('sasjs-for-vscode')
  const targetFromExt = extConfig.get('target')
  const isLocal = extConfig.get('isLocal') as boolean
  statusBarItem.text = `sasjs: ${(targetFromExt as string) ?? 'none'}`

  if (!targetFromExt) {
    statusBarItem.tooltip = `No target is selected.`
    statusBarItem.show()
    return
  }

  const config = isLocal
    ? ((await getLocalConfiguration()) as Configuration)
    : ((await getGlobalConfiguration()) as Configuration)

  if (!config?.targets?.length) {
    statusBarItem.tooltip = `Target Details\nNo Target found in ${
      isLocal ? 'local' : 'global'
    } config file`
    statusBarItem.show()
    return
  }

  const selectedTarget = config.targets.find(
    (t: any) => t.name === targetFromExt
  )

  if (!selectedTarget) {
    statusBarItem.tooltip = `Target Details\nTarget not found in ${
      isLocal ? 'local' : 'global'
    } config file`
    statusBarItem.show()
    return
  }

  statusBarItem.tooltip = `Target Details\nName: ${selectedTarget.name}\nServerUrl: ${selectedTarget.serverUrl}\nServerType: ${selectedTarget.serverType}`
  statusBarItem.show()
}
