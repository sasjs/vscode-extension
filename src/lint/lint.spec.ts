import * as vscode from 'vscode'
import { lintText, isIgnored, applyLintOverride, Severity } from '@sasjs/lint'
import * as lintConfigModule from '../utils/getLintConfig'
import { clearLintIssues, lint } from './lint'

jest.mock('vscode', () => {
  class Position {
    constructor(public line: number, public character: number) {}
  }
  class Range {
    constructor(public start: Position, public end: Position) {}
  }
  return {
    Position,
    Range,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
    workspace: { workspaceFolders: undefined },
    window: { showErrorMessage: jest.fn() },
    languages: { createDiagnosticCollection: jest.fn() }
  }
})

jest.mock('@sasjs/lint', () => ({
  ...jest.requireActual('@sasjs/lint'),
  lintText: jest.fn(),
  isIgnored: jest.fn(),
  applyLintOverride: jest.fn(() => ({ pathLintRules: [] }))
}))

jest.mock('../utils/getLintConfig', () => ({ getLintConfig: jest.fn() }))

const mockedLintText = lintText as jest.Mock
const mockedIsIgnored = isIgnored as jest.Mock
const mockedApplyOverride = applyLintOverride as jest.Mock
const mockedGetLintConfig = lintConfigModule.getLintConfig as jest.Mock
const mockedCreateCollection = vscode.languages
  .createDiagnosticCollection as jest.Mock

const document = {
  uri: { scheme: 'file', fsPath: '/project/programs/load.sas' },
  version: 1,
  getText: jest.fn(() => 'unsaved SAS code')
}

const textEditor = {
  document
} as unknown as vscode.TextEditor

const diagnostic = (
  lineNumber: number,
  severity: Severity,
  message = 'some issue'
) => ({
  lineNumber,
  startColumnNumber: 1,
  endColumnNumber: 6,
  message,
  severity
})

// The module caches the collection it created, so every test has to see the
// same object - a fresh one per test would only observe the first test's calls.
const collection = { clear: jest.fn(), set: jest.fn(), delete: jest.fn() }

beforeEach(() => {
  jest.clearAllMocks()
  process.chdir = jest.fn()
  mockedCreateCollection.mockReturnValue(collection)
  mockedGetLintConfig.mockResolvedValue({})
  mockedLintText.mockResolvedValue([])
  mockedIsIgnored.mockResolvedValue(false)
  mockedApplyOverride.mockReturnValue({ pathLintRules: [] })
  document.version = 1
  document.getText.mockReturnValue('unsaved SAS code')
})

describe('lint', () => {
  it('does nothing without a text editor', async () => {
    await lint(undefined)

    expect(mockedLintText).not.toHaveBeenCalled()
    expect(mockedCreateCollection).not.toHaveBeenCalled()
  })

  it('works in the workspace folder when one is open', async () => {
    const folders = [{ uri: { fsPath: '/project' } }]
    ;(vscode.workspace as any).workspaceFolders = folders

    await lint(textEditor)

    expect(process.chdir).toHaveBeenCalledWith('/project')
    ;(vscode.workspace as any).workspaceFolders = undefined
  })

  it('runs the linter on the document and publishes the diagnostics', async () => {
    mockedLintText.mockResolvedValue([
      diagnostic(2, Severity.Info),
      diagnostic(3, Severity.Warning),
      diagnostic(4, Severity.Error)
    ])

    await lint(textEditor)

    expect(mockedLintText).toHaveBeenCalledWith('unsaved SAS code', {})
    expect(mockedIsIgnored).toHaveBeenCalledWith('/project/programs/load.sas', {})
    expect(mockedApplyOverride).toHaveBeenCalledWith('unsaved SAS code', {})
    const [uri, diagnostics] = collection.set.mock.calls[0]
    expect(uri).toBe(document.uri)
    expect(diagnostics).toHaveLength(3)
    // linter lines and columns are 1-based, vscode's are 0-based
    expect(diagnostics[0].range.start).toEqual(new vscode.Position(1, 0))
    expect(diagnostics[0].range.end).toEqual(new vscode.Position(1, 6))
    expect(diagnostics.map((d: any) => d.severity)).toEqual([
      vscode.DiagnosticSeverity.Information,
      vscode.DiagnosticSeverity.Warning,
      vscode.DiagnosticSeverity.Error
    ])
    expect(diagnostics[0].source).toEqual('SASjs Lint')
  })

  it('reports lint failures without publishing stale results', async () => {
    mockedLintText.mockRejectedValue(new Error('lint engine failed'))
    await expect(lint(textEditor)).resolves.toBeUndefined()
    expect(collection.set).not.toHaveBeenCalled()
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('lint engine failed')
    )
  })

  it('removes only the failing document diagnostics on a lint engine error', async () => {
    await lint(textEditor)
    collection.clear.mockClear()
    const otherUri = { scheme: 'file', fsPath: '/project/other.sas' }
    const entries = new Map<any, unknown>([
      [document.uri, ['stale']],
      [otherUri, ['unrelated']]
    ])
    collection.clear.mockImplementation(() => entries.clear())
    collection.delete.mockImplementation((uri) => entries.delete(uri))
    mockedLintText.mockRejectedValue(new Error('lint engine failed'))

    try {
      await lint(textEditor)
      expect(entries.has(document.uri)).toBe(false)
      expect(entries.get(otherUri)).toEqual(['unrelated'])
      expect(collection.delete).toHaveBeenCalledWith(document.uri)
    } finally {
      collection.clear.mockReset()
      collection.delete.mockReset()
    }
  })

  it('does not repeat an identical lint failure on every keystroke', async () => {
    mockedLintText.mockRejectedValue(new Error('repeat engine failure'))
    await lint(textEditor)
    await lint(textEditor)
    expect((vscode.window.showErrorMessage as jest.Mock).mock.calls.filter(
      (call) => String(call[0]).includes('repeat engine failure')
    )).toHaveLength(1)
  })

  it('keeps ignored files free of diagnostics', async () => {
    mockedIsIgnored.mockResolvedValue(true)
    await lint(textEditor)
    expect(mockedLintText).not.toHaveBeenCalled()
    expect(mockedApplyOverride).not.toHaveBeenCalled()
    expect(collection.set).toHaveBeenCalledWith(document.uri, [])
  })

  it('runs configured path rules against the path with the effective inline config', async () => {
    const rule = jest.fn().mockReturnValue([diagnostic(1, Severity.Warning, 'path')])
    const override = { pathLintRules: [{ test: rule }] }
    mockedApplyOverride.mockReturnValue(override)
    await lint(textEditor)
    expect(mockedApplyOverride).toHaveBeenCalledWith('unsaved SAS code', {})
    expect(rule).toHaveBeenCalledWith(document.uri.fsPath, override)
    expect(collection.set.mock.calls[0][1][0].message).toBe('path')
  })

  it('does not publish results for a document edited during lint', async () => {
    let resolve!: (value: unknown[]) => void
    mockedLintText.mockImplementation(() => new Promise((r) => { resolve = r }))
    const pending = lint(textEditor)
    while (!resolve) {
      await new Promise((r) => setImmediate(r))
    }
    document.version++
    resolve([diagnostic(1, Severity.Warning)])
    await pending
    expect(collection.set).not.toHaveBeenCalled()
  })

  it('does not republish a result after diagnostics are cleared', async () => {
    let resolve!: (value: unknown[]) => void
    mockedLintText.mockImplementation(() => new Promise((r) => { resolve = r }))
    const pending = lint(textEditor)
    while (!resolve) {
      await new Promise((r) => setImmediate(r))
    }
    clearLintIssues()
    resolve([diagnostic(1, Severity.Warning)])
    await pending
    expect(collection.set).not.toHaveBeenCalled()
  })

  it('lets the latest lint win if requests finish out of order', async () => {
    let resolveFirst!: (value: unknown[]) => void
    mockedLintText.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirst = resolve
    }))
    const first = lint(textEditor)
    while (!resolveFirst) {
      await new Promise((resolve) => setImmediate(resolve))
    }
    mockedLintText.mockResolvedValueOnce([diagnostic(1, Severity.Warning, 'new')])
    await lint(textEditor)
    resolveFirst([diagnostic(1, Severity.Warning, 'old')])
    await first
    expect(collection.set).toHaveBeenCalledTimes(1)
    expect(collection.set.mock.calls[0][1][0].message).toBe('new')
  })

  it('lints untitled buffers without file-only path rules', async () => {
    const untitled = {
      ...document,
      uri: { scheme: 'untitled', fsPath: 'Untitled-1' }
    }
    await lint({ document: untitled } as unknown as vscode.TextEditor)
    expect(mockedLintText).toHaveBeenCalledWith('unsaved SAS code', {})
    expect(mockedIsIgnored).not.toHaveBeenCalled()
    expect(mockedApplyOverride).not.toHaveBeenCalled()
  })

  it('clears the previous diagnostics on the second run', async () => {
    // the collection is created once per session and cleared before every
    // republish, so the count is relative to whatever earlier tests left
    const before = collection.clear.mock.calls.length

    await lint(textEditor)
    const afterFirst = collection.clear.mock.calls.length

    await lint(textEditor)
    expect(collection.clear.mock.calls.length).toEqual(afterFirst + 1)
    expect(afterFirst).toBeGreaterThanOrEqual(before)
  })

  it('clears issues when asked, once a collection exists', async () => {
    await lint(textEditor)
    const before = collection.clear.mock.calls.length

    clearLintIssues()

    expect(collection.clear.mock.calls.length).toEqual(before + 1)
  })

  it('reports a lint configuration that will not load, and marks nothing', async () => {
    const fromConfig = collection.set.mock.calls.length
    mockedGetLintConfig.mockRejectedValue(
      new Error('/project/.sasjslint is not valid JSON (Unexpected token)')
    )

    await lint(textEditor)

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('.sasjslint is not valid JSON')
    )
    // nothing is linted against rules the project did not state
    expect(mockedLintText).not.toHaveBeenCalled()
    expect(collection.set.mock.calls.length).toEqual(fromConfig)
  })

  it('clears all diagnostics when the shared project lint configuration fails', async () => {
    await lint(textEditor)
    collection.clear.mockClear()
    mockedGetLintConfig.mockRejectedValue(new Error('bad project config'))

    await lint(textEditor)

    expect(collection.clear).toHaveBeenCalledTimes(1)
    expect(collection.delete).not.toHaveBeenCalled()
  })

  it('reports the same broken configuration once, not on every change', async () => {
    const message = 'a message only this case raises'
    mockedGetLintConfig.mockRejectedValue(new Error(message))

    await lint(textEditor)
    await lint(textEditor)

    expect(
      (vscode.window.showErrorMessage as jest.Mock).mock.calls.filter(
        (call) => call[0] === message
      ).length
    ).toEqual(1)
  })

  it('reports again once the configuration loads and then breaks anew', async () => {
    const message = 'a second message only this case raises'
    mockedGetLintConfig.mockRejectedValue(new Error(message))
    await lint(textEditor)

    // a good configuration clears the memory of the previous failure
    mockedGetLintConfig.mockResolvedValue({})
    await lint(textEditor)

    mockedGetLintConfig.mockRejectedValue(new Error(message))
    await lint(textEditor)

    expect(
      (vscode.window.showErrorMessage as jest.Mock).mock.calls.filter(
        (call) => call[0] === message
      ).length
    ).toEqual(2)
  })

  it('survives being cleared before anything was linted', () => {
    jest.isolateModules(() => {
      // a fresh module registry, so the collection is undefined again
      const fresh = require('./lint')
      expect(() => fresh.clearLintIssues()).not.toThrow()
    })
  })
})
