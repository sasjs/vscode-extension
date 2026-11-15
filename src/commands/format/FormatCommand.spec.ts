import * as vscode from 'vscode'
import { formatText } from '@sasjs/lint'
import * as lintConfigModule from '../../utils/getLintConfig'
import { FormatCommand } from './FormatCommand'

jest.mock('vscode', () => {
  class Position {
    constructor(
      public line: number,
      public character: number
    ) {}
  }
  class Range {
    constructor(
      public start: Position,
      public end: Position
    ) {}
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
const format = async (
  loadEngine?: () => Promise<unknown>
): Promise<vscode.TextEdit[]> => {
  await new (FormatCommand as any)(loadEngine).initialise()

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
      expect.anything(),
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

  it('gives the formatter the engine, so the layout pass runs', async () => {
    // The engine is what indents and what applies keywordCase; without it the
    // rules alone apply, which is the behaviour this closes.
    const engine = jest.fn(async () => 'data _null_;\n  run;\n')
    mockedFormatText.mockImplementation(async (text, config, options) => {
      return options.reprint
        ? options.reprint(text, { keywordCase: 'preserve' })
        : text
    })

    const edits = await format(async () => engine)

    expect(engine).toHaveBeenCalledWith('data _null_; run;', {
      keywordCase: 'preserve'
    })
    expect(edits).toEqual([
      expect.objectContaining({ newText: 'data _null_;\n  run;\n' })
    ])
  })

  it('falls back to the rules alone when the engine cannot be loaded', async () => {
    // A broken install should not make the formatter refuse to work: the header
    // and the wrapping are still the linter's job.
    const loadEngine = jest.fn(async () => {
      throw new Error('module not found')
    })
    mockedFormatText.mockResolvedValue('the rules only')

    const edits = await format(loadEngine)

    expect(mockedFormatText).toHaveBeenCalledWith(
      'data _null_; run;',
      expect.anything(),
      {}
    )
    expect(edits).toEqual([
      expect.objectContaining({ newText: 'the rules only' })
    ])
  })
})
