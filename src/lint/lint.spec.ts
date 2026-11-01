import * as vscode from 'vscode'
import { lintFile, Severity } from '@sasjs/lint'
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
    languages: { createDiagnosticCollection: jest.fn() }
  }
})

jest.mock('@sasjs/lint', () => ({
  ...jest.requireActual('@sasjs/lint'),
  lintFile: jest.fn()
}))

jest.mock('../utils/getLintConfig', () => ({ getLintConfig: jest.fn() }))

const mockedLintFile = lintFile as jest.Mock
const mockedGetLintConfig = lintConfigModule.getLintConfig as jest.Mock
const mockedCreateCollection = vscode.languages
  .createDiagnosticCollection as jest.Mock

const document = { uri: { fsPath: '/project/programs/load.sas' } }

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
const collection = { clear: jest.fn(), set: jest.fn() }

beforeEach(() => {
  jest.clearAllMocks()
  process.chdir = jest.fn()
  mockedCreateCollection.mockReturnValue(collection)
  mockedGetLintConfig.mockResolvedValue({})
  mockedLintFile.mockResolvedValue([])
})

describe('lint', () => {
  it('does nothing without a text editor', async () => {
    await lint(undefined)

    expect(mockedLintFile).not.toHaveBeenCalled()
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
    mockedLintFile.mockResolvedValue([
      diagnostic(2, Severity.Info),
      diagnostic(3, Severity.Warning),
      diagnostic(4, Severity.Error)
    ])

    await lint(textEditor)

    expect(mockedLintFile).toHaveBeenCalledWith(
      '/project/programs/load.sas',
      {}
    )
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

  it('survives being cleared before anything was linted', () => {
    jest.isolateModules(() => {
      // a fresh module registry, so the collection is undefined again
      const fresh = require('./lint')
      expect(() => fresh.clearLintIssues()).not.toThrow()
    })
  })
})
