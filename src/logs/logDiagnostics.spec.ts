/**
 * Asserts the log wiring: that a log in a SASjs project gets one diagnostic per
 * issue with the severity and range a reader needs, that the same issues colour
 * the visible editor, and that a .log outside a SASjs project is left alone.
 *
 * The parser itself is the real one - a log is parsed in these tests, not
 * stubbed - and it is wrapped so the tests can also assert that a document that
 * has not changed is not parsed twice. The vscode module is jest-mocked, so the
 * wiring runs without VS Code.
 */

interface FakeDiagnostic {
  range: FakeRange
  message: string
  severity: number
  source?: string
  code?: string | number
}

interface FakeRange {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

const diagnosticsSet = jest.fn()
const diagnosticsDelete = jest.fn()
const setDecorations = jest.fn()
const revealRange = jest.fn()

class Position {
  constructor(public line: number, public character: number) {}
}

class Range {
  start: Position
  end: Position

  constructor(
    startLineOrPosition: number | Position,
    startCharacterOrPosition: number | Position,
    endLine?: number,
    endCharacter?: number
  ) {
    if (typeof startLineOrPosition === 'number') {
      this.start = new Position(startLineOrPosition, startCharacterOrPosition as number)
      this.end = new Position(endLine as number, endCharacter as number)
    } else {
      this.start = startLineOrPosition
      this.end = startCharacterOrPosition as Position
    }
  }
}

class Diagnostic implements FakeDiagnostic {
  source?: string
  code?: string | number

  constructor(
    public range: Range,
    public message: string,
    public severity: number
  ) {}
}

jest.mock('vscode', () => ({
  Diagnostic,
  DiagnosticSeverity: { Error: 0, Warning: 1 },
  OverviewRulerLane: { Right: 4 },
  Position,
  Range,
  ThemeColor: class {},
  Uri: { parse: (value: string) => ({ toString: () => value }) },
  languages: {
    createDiagnosticCollection: () => ({
      set: diagnosticsSet,
      delete: diagnosticsDelete,
      clear: jest.fn(),
      dispose: jest.fn()
    })
  },
  window: {
    visibleTextEditors: [],
    createTextEditorDecorationType: (options: unknown) => ({
      options,
      dispose: jest.fn()
    }),
    onDidChangeActiveTextEditor: () => ({ dispose: jest.fn() })
  },
  workspace: {
    onDidOpenTextDocument: () => ({ dispose: jest.fn() }),
    onDidSaveTextDocument: () => ({ dispose: jest.fn() }),
    onDidChangeTextDocument: () => ({ dispose: jest.fn() }),
    onDidCloseTextDocument: () => ({ dispose: jest.fn() })
  }
}))

jest.mock('@sasjs/sas-language/logs', () => {
  const actual = jest.requireActual('@sasjs/sas-language/logs')

  // A bare spy: `resetMocks` clears implementations between tests, so the real
  // parser is put back in `beforeEach` rather than captured once here.
  return { ...actual, parseLog: jest.fn() }
})

import { window } from 'vscode'
import { analyse, clear, registerLogDiagnostics } from './logDiagnostics'

const LOG = [
  '1    data want;',
  '2      x = age / 0;',
  '3    run;',
  'WARNING: Division by zero detected at line 2 column 11.',
  'ERROR: File WORK.MISSING_DS.DATA does not exist.',
  'ERROR 22-322: Syntax error, expecting one of the following: ;, CANCEL,',
  '              RUN, QUIT.',
  ''
].join('\n')

const document = (fileName = '/tmp/project/sasjsresults/run.log', version = 1) => ({
  fileName,
  version,
  uri: {
    toString: () => `file://${fileName}`,
    fsPath: fileName
  },
  getText: () => LOG
})

const context = { subscriptions: [] as unknown[] } as any

const parseLog = () =>
  jest.requireMock('@sasjs/sas-language/logs').parseLog as jest.Mock

describe('log issues', () => {
  beforeEach(() => {
    parseLog().mockImplementation(jest.requireActual('@sasjs/sas-language/logs').parseLog)
    diagnosticsSet.mockClear()
    diagnosticsDelete.mockClear()
    setDecorations.mockClear()
    parseLog().mockClear()
    ;(process as any).isSasjsProject = true
    ;(window as any).visibleTextEditors = []
  })

  afterEach(() => {
    clear(document().uri as any)
  })

  it('publishes one diagnostic per error and warning in the log', async () => {
    await analyse(document() as any)

    expect(diagnosticsSet).toHaveBeenCalledTimes(1)

    const [, diagnostics] = diagnosticsSet.mock.calls[0] as [
      unknown,
      FakeDiagnostic[]
    ]

    expect(diagnostics).toHaveLength(3)
    expect(diagnostics[0].severity).toBe(1)
    expect(diagnostics[0].message).toBe(
      'Division by zero detected at line 2 column 11.'
    )
    expect(diagnostics[1].severity).toBe(0)
    expect(diagnostics[2].code).toBe('22-322')
  })

  it('addresses the marker on the line it starts and ends at the line end', async () => {
    await analyse(document() as any)

    const [, diagnostics] = diagnosticsSet.mock.calls[0] as [
      unknown,
      FakeDiagnostic[]
    ]

    expect(diagnostics[0].range.start).toEqual({ line: 3, character: 0 })
    expect(diagnostics[0].range.end).toEqual({
      line: 3,
      character: 'WARNING: Division by zero detected at line 2 column 11.'.length
    })
    expect(diagnostics[1].range.start.line).toBe(4)
    // The message SAS wrapped is one diagnostic, ending where its marker line does.
    expect(diagnostics[2].range.start.line).toBe(5)
    expect(diagnostics[2].range.end.line).toBe(5)
  })

  it('files the issues under a source a reader can filter on', async () => {
    await analyse(document() as any)

    const [, diagnostics] = diagnosticsSet.mock.calls[0] as [
      unknown,
      FakeDiagnostic[]
    ]

    expect(diagnostics.every((diagnostic) => diagnostic.source === 'SASjs log')).toBe(
      true
    )
  })

  it('colours the visible editor, whole-line, one decoration per severity', async () => {
    const editor = { document: document(), setDecorations }
    ;(window as any).visibleTextEditors = [editor]

    await analyse(editor.document as any)

    expect(setDecorations).toHaveBeenCalledTimes(2)

    const [errors, warnings] = setDecorations.mock.calls.map(
      (call) => call[1] as FakeRange[]
    )

    expect(errors).toHaveLength(2)
    expect(errors[0]).toEqual({
      start: { line: 4, character: 0 },
      end: { line: 4, character: 0 }
    })
    // The second error wraps onto line 6, so its colour covers both lines.
    expect(errors[1]).toEqual({
      start: { line: 5, character: 0 },
      end: { line: 6, character: 0 }
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0].start).toEqual({ line: 3, character: 0 })
  })

  it('parses a log once, however often it is analysed unchanged', async () => {
    await analyse(document() as any)
    await analyse(document() as any)

    expect(parseLog()).toHaveBeenCalledTimes(1)
  })

  it('parses a log again once its version moves', async () => {
    await analyse(document() as any)
    await analyse(document(undefined, 2) as any)

    expect(parseLog()).toHaveBeenCalledTimes(2)
  })

  it('leaves a .log outside a SASjs project alone', async () => {
    ;(process as any).isSasjsProject = false

    await analyse(document() as any)

    expect(parseLog()).not.toHaveBeenCalled()
    expect(diagnosticsSet).not.toHaveBeenCalled()
    expect(diagnosticsDelete).toHaveBeenCalledTimes(1)
  })

  it('leaves a file that is not a log alone', async () => {
    await analyse(document('/tmp/project/sasjsresults/run.sas') as any)

    expect(parseLog()).not.toHaveBeenCalled()
  })

  it('registers its subscriptions on activation', () => {
    registerLogDiagnostics(context)

    expect(context.subscriptions.length).toBeGreaterThan(0)
  })
})
