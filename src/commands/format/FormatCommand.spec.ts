import * as vscode from 'vscode'
import { formatText } from '@sasjs/lint'
import * as lintConfigModule from '../../utils/getLintConfig'
import { FormatCommand } from './FormatCommand'

jest.mock('vscode', () => {
  class Position {
    constructor(public line: number, public character: number) {}
  }
  class Range {
    constructor(public start: Position, public end: Position) {}
  }
  class TextEdit {
    static replace(range: unknown, newText: string) {
      return { range, newText }
    }
  }

  return {
    Position,
    Range,
    TextEdit,
    window: { showErrorMessage: jest.fn() },
    languages: { registerDocumentFormattingEditProvider: jest.fn() }
  }
})

jest.mock('@sasjs/lint', () => ({
  ...jest.requireActual('@sasjs/lint'),
  formatText: jest.fn()
}))

jest.mock('../../utils/getLintConfig', () => ({
  getLintConfig: jest.fn()
}))

const mockedFormatText = formatText as jest.Mock
const mockedGetLintConfig = lintConfigModule.getLintConfig as jest.Mock
const mockedRegister = vscode.languages
  .registerDocumentFormattingEditProvider as jest.Mock
const mockedShowError = vscode.window.showErrorMessage as jest.Mock

const document = {
  lineCount: 2,
  getText: () => 'data _null_; run;'
} as unknown as vscode.TextDocument

/** The provider the command registered, which is what vscode would call. */
const format = async (): Promise<vscode.TextEdit[]> => {
  await new FormatCommand().initialise()

  const provider =
    mockedRegister.mock.calls[mockedRegister.mock.calls.length - 1][1]

  return provider.provideDocumentFormattingEdits(document)
}

beforeEach(() => {
  mockedGetLintConfig.mockResolvedValue({})
  mockedFormatText.mockResolvedValue('formatted text')
})

describe('FormatCommand', () => {
  it('replaces the document when the configuration loads', async () => {
    const edits = await format()

    expect(edits).toHaveLength(1)
    expect(edits[0].newText).toEqual('formatted text')
    expect(mockedFormatText).toHaveBeenCalledWith(
      'data _null_; run;',
      expect.anything()
    )
  })

  it('leaves the document untouched and says why when the config will not load', async () => {
    const message = '/project/.sasjslint is not valid JSON (a case of its own)'
    mockedGetLintConfig.mockRejectedValue(new Error(message))

    const edits = await format()

    // no edits: formatting under rules the project did not state would rewrite
    // the document, which is worse than leaving it alone
    expect(edits).toEqual([])
    expect(mockedFormatText).not.toHaveBeenCalled()
    expect(mockedShowError).toHaveBeenCalledWith(message)
  })

  it('lets a formatter failure reach the provider instead of calling it a config error', async () => {
    mockedFormatText.mockRejectedValue(new Error('the formatter broke'))

    await expect(format()).rejects.toThrow('the formatter broke')

    // a bug inside formatText is not a configuration problem, so nothing is
    // reported as one
    expect(
      mockedShowError.mock.calls.filter((call) =>
        String(call[0]).includes('is not valid JSON')
      )
    ).toEqual([])
  })
})
