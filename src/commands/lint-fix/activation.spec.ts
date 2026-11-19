import * as vscode from 'vscode'
import { lint, clearLintIssues } from '../../lint/lint'
import { registerLintFixCommand } from './LintFixCommand'

jest.mock('vscode', () => ({
  commands: { executeCommand: jest.fn() },
  workspace: { workspaceFolders: [{ uri: { fsPath: '/project' } }], onDidChangeTextDocument: jest.fn(), onDidChangeConfiguration: jest.fn(), getConfiguration: jest.fn(() => ({ get: jest.fn() })) },
  window: { activeTextEditor: undefined, onDidChangeActiveTextEditor: jest.fn(), createStatusBarItem: jest.fn(() => ({ show: jest.fn() })) },
  StatusBarAlignment: { Right: 1 }
}))
jest.mock('../../lint/lint', () => ({ lint: jest.fn(), clearLintIssues: jest.fn() }))
jest.mock('./LintFixCommand', () => ({ registerLintFixCommand: jest.fn() }))
jest.mock('../../languageServer/languageServer', () => ({ startSasLanguageServer: jest.fn(), stopSasLanguageServer: jest.fn() }))
jest.mock('../../logs/logDiagnostics', () => ({ registerLogDiagnostics: jest.fn(), registerLogEditorContext: jest.fn(), registerLogNotesCommands: jest.fn() }))
jest.mock('../../utils/setProcessVariables', () => ({ setProcessVariables: jest.fn() }))
jest.mock('../../utils/config', () => ({ getGlobalConfiguration: jest.fn(), getLocalConfiguration: jest.fn() }))
jest.mock('../execute-code/ExecuteCodeCommand', () => ({ ExecuteCodeCommand: class { initialise() {} } }))
jest.mock('../execute-code/ExecutingCodeCommand', () => ({ ExecutingCodeCommand: class { initialise() {} } }))
jest.mock('../sync-directories/syncDirectoriesCommand', () => ({ SyncDirectoriesCommand: class { initialise() {} } }))
jest.mock('../sync-directories/syncingDirectoriesCommand', () => ({ SyncingDirectoriesCommand: class { initialise() {} } }))
jest.mock('../creating-target/createTargetCommand', () => ({ CreateTargetCommand: class { initialise() {} } }))
jest.mock('../delete-target/deleteTargetCommand', () => ({ DeleteTargetCommand: class { initialise() {} } }))
jest.mock('../authenticating-target/authenticateTargetCommand', () => ({ AuthenticateTargetCommand: class { initialise() {} } }))
jest.mock('../select-target/selectTargetCommand', () => ({ SelectTargetCommand: class { initialise() {} } }))
jest.mock('../show-target/showTargetCommand', () => ({ ShowTargetCommand: class { initialise() {} } }))
jest.mock('../docs/docsCommand', () => ({ DocsCommand: class { initialise() {} } }))
jest.mock('../format/FormatCommand', () => ({ FormatCommand: class { initialise() {} } }))
jest.mock('../compileBuildDeploy/compileBuildDeployCommand', () => ({ CompileBuildDeployCommand: class { initialise() {} } }))
jest.mock('../addRemoveComment/addRemoveComment', () => ({ AddRemoveCommentCommand: class { initialise() {} } }))
jest.mock('../log-issues/LogIssueCommand', () => ({ LogIssueCommand: class { initialise() {} } }))

const mockLint = lint as jest.Mock
const mockClear = clearLintIssues as jest.Mock

beforeEach(() => {
  ;(vscode.window.createStatusBarItem as jest.Mock).mockReturnValue({ show: jest.fn() })
  ;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: jest.fn() })
})

test('activation registers lint fix and lints the already active SAS document', async () => {
  const editor = { document: { languageId: 'sas' } }
  ;(vscode.window as any).activeTextEditor = editor
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext
  const { activate } = require('../../extension')
  await activate(context)
  expect(registerLintFixCommand).toHaveBeenCalledWith(context)
  expect(mockLint).toHaveBeenCalledWith(editor)
})

test('only changes to the active SAS document trigger lint', async () => {
  const active = { document: { languageId: 'sas' } }
  ;(vscode.window as any).activeTextEditor = active
  const { activate } = require('../../extension')
  await activate({ subscriptions: [] })
  mockLint.mockClear()
  mockClear.mockClear()
  const onChange = (vscode.workspace.onDidChangeTextDocument as jest.Mock).mock.calls[0][0]
  onChange({ document: { languageId: 'sas' } })
  onChange({ document: { languageId: 'plaintext' } })
  expect(mockLint).not.toHaveBeenCalled()
  expect(mockClear).not.toHaveBeenCalled()
  onChange({ document: active.document })
  expect(mockLint).toHaveBeenCalledTimes(1)
  expect(mockLint).toHaveBeenCalledWith(active)
  active.document.languageId = 'plaintext'
  onChange({ document: active.document })
  expect(mockClear).toHaveBeenCalledTimes(1)
})
