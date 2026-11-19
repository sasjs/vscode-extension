import * as vscode from 'vscode'
import { formatText, LintConfig } from '@sasjs/lint'
import { getLintConfig } from '../../utils/getLintConfig'

jest.mock('vscode', () => ({
  Range: class Range {
    constructor(public start: unknown, public end: unknown) {}
  },
  Position: class Position {
    constructor(public line: number, public character: number) {}
  },
  commands: { registerCommand: jest.fn() },
  window: { activeTextEditor: undefined, showErrorMessage: jest.fn(), showWarningMessage: jest.fn() }
}))
jest.mock('@sasjs/lint', () => ({ ...jest.requireActual('@sasjs/lint'), formatText: jest.fn() }))
jest.mock('../../utils/getLintConfig', () => ({ getLintConfig: jest.fn() }))

const register = vscode.commands.registerCommand as jest.Mock
const config = getLintConfig as jest.Mock
const format = formatText as jest.Mock
const error = vscode.window.showErrorMessage as jest.Mock
const warning = vscode.window.showWarningMessage as jest.Mock

beforeEach(() => {
  ;(vscode.window as any).activeTextEditor = undefined
  config.mockResolvedValue(new LintConfig())
  format.mockImplementation(jest.requireActual('@sasjs/lint').formatText)
})

function setup(text = 'data x;  \nrun;\n', languageId = 'sas') {
  const document = { uri: { toString: () => 'file:///active.sas' }, languageId, version: 1, lineCount: 3, positionAt: jest.fn((offset: number) => ({ offset })), getText: jest.fn(() => text), isClosed: false, save: jest.fn() }
  const replace = jest.fn()
  const edit = jest.fn(async (callback) => { callback({ replace }); return true })
  const editor = { document, edit }
  ;(vscode.window as any).activeTextEditor = editor
  const disposable = { dispose: jest.fn() }
  register.mockReturnValue(disposable)
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext
  const { registerLintFixCommand } = require('./LintFixCommand')
  registerLintFixCommand(context)
  const handler = register.mock.calls.find(([id]) => id === 'sasjs-for-vscode.fixLintIssues')?.[1]
  expect(handler).toBeDefined()
  expect(context.subscriptions).toContain(disposable)
  return { document, editor, edit, replace, handler }
}

test('fixes the unsaved buffer using the real rules without reprinting or saving', async () => {
  const { document, edit, replace, handler } = setup()
  await handler()
  expect(format).toHaveBeenCalledWith('data x;  \nrun;\n', expect.any(LintConfig))
  expect(edit).toHaveBeenCalledTimes(1)
  expect(replace).toHaveBeenCalledWith(expect.objectContaining({
    start: expect.objectContaining({ line: 0, character: 0 }),
    end: { offset: 'data x;  \nrun;\n'.length }
  }), expect.stringContaining('data x;\nrun;\n'))
  expect(document.save).not.toHaveBeenCalled()
})

test('does not fix a file ignored by lint configuration', async () => {
  const { document, edit, handler } = setup()
  Object.assign(document.uri, { scheme: 'file', fsPath: require('path').join(process.cwd(), 'ignored.sas') })
  const lintConfig = new LintConfig()
  lintConfig.ignoreList = ['ignored.sas']
  config.mockResolvedValue(lintConfig)
  await handler()
  expect(edit).not.toHaveBeenCalled()
})

test('allows lint fixes on a document containing inline data', async () => {
  const input = 'data x;\ninput value $char5.;\ndatalines;\nA    \n;\nrun;\n'
  const { handler } = setup(input)
  await handler()
  expect(format).toHaveBeenCalledWith(input, expect.any(LintConfig))
})

test('does not edit if the document changes while config loads', async () => {
  const { document, edit, handler } = setup()
  let resolve!: (value: LintConfig) => void
  config.mockReturnValue(new Promise<LintConfig>((done) => { resolve = done }))
  const running = handler()
  document.version++
  resolve(new LintConfig())
  await running
  expect(edit).not.toHaveBeenCalled()
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('changed'))
})

test('does not edit if the document changes while rules run', async () => {
  const { document, edit, handler } = setup()
  let resolve!: (value: string) => void
  format.mockReturnValue(new Promise<string>((done) => { resolve = done }))
  const running = handler()
  await Promise.resolve()
  document.version++
  resolve('changed')
  await running
  expect(edit).not.toHaveBeenCalled()
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('changed'))
})

test('does not edit a closed document', async () => {
  const { document, edit, handler } = setup()
  format.mockImplementation(async () => { document.isClosed = true; return 'fixed' })
  await handler()
  expect(edit).not.toHaveBeenCalled()
})

test('does nothing without an active SAS editor', async () => {
  const { edit, handler } = setup('x', 'plaintext')
  await handler()
  ;(vscode.window as any).activeTextEditor = undefined
  await handler()
  expect(config).not.toHaveBeenCalled()
  expect(edit).not.toHaveBeenCalled()
})

test('avoids a needless edit when rules change nothing', async () => {
  const { edit, handler } = setup('unchanged')
  format.mockResolvedValue('unchanged')
  await handler()
  expect(edit).not.toHaveBeenCalled()
})

test('reports configuration failure without running rules', async () => {
  const { edit, handler } = setup()
  config.mockRejectedValue(new Error('invalid config'))
  await handler()
  expect(format).not.toHaveBeenCalled()
  expect(edit).not.toHaveBeenCalled()
  expect(error).toHaveBeenCalledWith(expect.stringContaining('invalid config'))
})

test('reports rule and edit failures', async () => {
  const { edit, handler } = setup()
  format.mockRejectedValueOnce(new Error('rule failure'))
  await handler()
  expect(error).toHaveBeenCalledWith(expect.stringContaining('rule failure'))
  format.mockResolvedValue('fixed')
  edit.mockResolvedValueOnce(false)
  await handler()
  expect(error).toHaveBeenCalledWith(expect.stringContaining('Could not apply'))
})

test('does not apply to an editor no longer active', async () => {
  const { edit, handler } = setup()
  format.mockImplementation(async () => { (vscode.window as any).activeTextEditor = undefined; return 'fixed' })
  await handler()
  expect(edit).not.toHaveBeenCalled()
})

test('rejects a title action for a different split editor rather than editing the active document', async () => {
  const { edit, handler } = setup()
  await handler({ toString: () => 'file:///other.sas' })
  expect(edit).not.toHaveBeenCalled()
  expect(config).not.toHaveBeenCalled()
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('Activate'))
})

test('accepts a title action for the active document URI', async () => {
  const { edit, handler } = setup()
  await handler({ toString: () => 'file:///active.sas' })
  expect(edit).toHaveBeenCalledTimes(1)
})
