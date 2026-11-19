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

  class Uri {
    constructor(public value: string) {}
    static isUri(value: unknown) {
      if (value instanceof Uri) {return true}
      if (!value || typeof value !== 'object') {return false}
      const uri = value as Record<string, unknown>
      return ['authority', 'fragment', 'path', 'query', 'scheme', 'fsPath']
        .every((key) => typeof uri[key] === 'string') &&
        typeof uri.with === 'function' && typeof uri.toString === 'function'
    }
    toString() { return this.value }
  }

  return {
    Uri,
    Position,
    Range,
    TextEdit,
    window: {
      showErrorMessage: jest.fn(),
      showWarningMessage: jest.fn(),
      activeTextEditor: undefined as unknown,
      visibleTextEditors: [],
      showTextDocument: jest.fn()
    },
    languages: { registerDocumentFormattingEditProvider: jest.fn() },
    commands: {
      registerCommand: jest.fn(),
      executeCommand: jest.fn()
    }
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
const mockedRegisterCommand = vscode.commands.registerCommand as jest.Mock
const mockedExecuteCommand = vscode.commands.executeCommand as jest.Mock

/** The handler registered under the command id the manifest contributes. */
const invokeFormatDocument = async (languageId?: string) => {
  ;(vscode.window as any).activeTextEditor = languageId
    ? { document: { languageId } }
    : undefined

  await new (FormatCommand as any)(async () => jest.fn()).initialise({ subscriptions: [] })

  const call = mockedRegisterCommand.mock.calls.find(
    (registered) => registered[0] === 'sasjs-for-vscode.formatDocument'
  )

  if (!call) {
    throw new Error('Format document command was not registered')
  }

  return call[1]()
}

const document = {
  lineCount: 2,
  getText: () => 'data _null_; run;'
} as unknown as vscode.TextDocument

/** The provider the command registered, which is what vscode would call. */
const format = async (
  loadEngine?: () => Promise<unknown>
): Promise<vscode.TextEdit[]> => {
  await new (FormatCommand as any)(loadEngine).initialise({ subscriptions: [] })

  const provider =
    mockedRegister.mock.calls[mockedRegister.mock.calls.length - 1][1]

  return provider.provideDocumentFormattingEdits(document)
}

/**
 * One command and the provider it registered, for cases about what the command
 * remembers between calls - `format` builds a new command each time.
 */
const formatRepeatedly = async (
  loadEngine?: () => Promise<unknown>
): Promise<() => Promise<vscode.TextEdit[]>> => {
  await new (FormatCommand as any)(loadEngine).initialise({ subscriptions: [] })

  const provider =
    mockedRegister.mock.calls[mockedRegister.mock.calls.length - 1][1]

  return () => provider.provideDocumentFormattingEdits(document)
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

  it('allows formatting a document containing inline data', async () => {
    await new FormatCommand(async () => jest.fn()).initialise({ subscriptions: [] })
    const provider = mockedRegister.mock.calls[mockedRegister.mock.calls.length - 1][1]
    const input = { lineCount: 4, getText: () => 'data x;\ndatalines;\nA    \n;\n' }
    const edits = await provider.provideDocumentFormattingEdits(input)
    expect(edits).toHaveLength(1)
    expect(mockedFormatText).toHaveBeenCalledWith(input.getText(), expect.anything(), expect.anything())
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

    // What this command decides: the engine is handed the document's text, and
    // what it returns becomes the edit. The casing it is called with is
    // `LintConfig.keywordCase` applied inside the linter, so asserting it here
    // would only be asserting this file's own stub.
    expect(engine).toHaveBeenCalledWith('data _null_; run;', expect.anything())
    expect(edits).toEqual([
      expect.objectContaining({ newText: 'data _null_;\n  run;\n' })
    ])
  })

  it('retries a load that failed instead of keeping the rejection', async () => {
    // A rejection kept for the window's life would leave every later format
    // rule-only until reload, for a failure that may well have been transient.
    const engine = jest.fn(async () => 'the engine formatted this')
    const loadEngine = jest
      .fn()
      .mockRejectedValueOnce(new Error('module not found'))
      .mockResolvedValue(engine)

    mockedFormatText.mockImplementation(async (text, config, options) =>
      options.reprint
        ? options.reprint(text, { keywordCase: 'preserve' })
        : text
    )

    const formatAgain = await formatRepeatedly(loadEngine)

    await formatAgain()
    const edits = await formatAgain()

    expect(loadEngine).toHaveBeenCalledTimes(2)
    expect(edits).toEqual([
      expect.objectContaining({ newText: 'the engine formatted this' })
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
    // reported, not swallowed: a silent difference between "no layout
    // configured" and "layout unavailable" is how a broken install survives
    expect(mockedShowError).toHaveBeenCalledWith('module not found')
    expect(edits).toEqual([
      expect.objectContaining({ newText: 'the rules only' })
    ])
  })

  it('registers both resources for disposal with the extension context', async () => {
    const provider = { dispose: jest.fn() }
    const command = { dispose: jest.fn() }
    mockedRegister.mockReturnValue(provider)
    mockedRegisterCommand.mockReturnValue(command)
    const context = { subscriptions: [] as vscode.Disposable[] }

    await new (FormatCommand as any)(async () => jest.fn()).initialise(context)

    expect(context.subscriptions).toEqual([provider, command])
    context.subscriptions.forEach((item) => item.dispose())
    expect(provider.dispose).toHaveBeenCalledTimes(1)
    expect(command.dispose).toHaveBeenCalledTimes(1)
  })

  it('registers the format-document command the manifest contributes', async () => {
    await new (FormatCommand as any)(async () => jest.fn()).initialise({ subscriptions: [] })

    expect(mockedRegisterCommand).toHaveBeenCalledWith(
      'sasjs-for-vscode.formatDocument',
      expect.any(Function)
    )
  })

  it('runs the format action the button and Shift+Alt+F also run', async () => {
    // Going through the core action rather than the provider directly is what
    // keeps one code path for the button, the shortcut and format on save.
    await invokeFormatDocument('sas')

    expect(mockedExecuteCommand).toHaveBeenCalledWith(
      'editor.action.formatDocument'
    )
  })

  it.each(['file:///target.sas', null, {}])('warns and does not format when the supplied resource is invalid: %p', async (resource) => {
    ;(vscode.window as any).activeTextEditor = { document: { languageId: 'sas', uri: new (vscode.Uri as any)('file:///active.sas') } }
    await new FormatCommand(async () => jest.fn()).initialise({ subscriptions: [] })
    await mockedRegisterCommand.mock.calls[0][1](resource)

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('resource'))
    expect(mockedExecuteCommand).not.toHaveBeenCalled()
  })

  it('accepts a URI recognized by VS Code even when it has a different prototype', async () => {
    const resource = {
      scheme: 'file', authority: '', path: '/active.sas', query: '', fragment: '',
      fsPath: '/active.sas', with: () => resource, toString: () => 'file:///active.sas'
    }
    expect((vscode.Uri as any).isUri(resource)).toBe(true)
    expect(resource).not.toBeInstanceOf(vscode.Uri)
    ;(vscode.window as any).activeTextEditor = { document: { languageId: 'sas', uri: resource } }
    await new FormatCommand(async () => jest.fn()).initialise({ subscriptions: [] })
    await mockedRegisterCommand.mock.calls[0][1](resource)
    expect(mockedExecuteCommand).toHaveBeenCalledWith('editor.action.formatDocument')
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled()
  })

  it('warns when the selected title resource is not visible instead of formatting another editor', async () => {
    const active = { document: { languageId: 'sas', uri: new (vscode.Uri as any)('file:///wrong.sas') } }
    ;(vscode.window as any).activeTextEditor = active
    ;(vscode.window as any).visibleTextEditors = [active]
    await new (FormatCommand as any)(async () => jest.fn()).initialise({ subscriptions: [] })
    const handler = mockedRegisterCommand.mock.calls[0][1]

    await handler(new (vscode.Uri as any)('file:///target.sas'))

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'Activate the selected SAS editor and try again.'
    )
    expect(vscode.window.showTextDocument).not.toHaveBeenCalled()
    expect(mockedExecuteCommand).not.toHaveBeenCalled()
  })

  it('focuses the requested visible SAS resource before formatting it', async () => {
    const target = { document: { languageId: 'sas', uri: new (vscode.Uri as any)('file:///target.sas') }, viewColumn: 2 }
    ;(vscode.window as any).activeTextEditor = { document: { languageId: 'sas', uri: new (vscode.Uri as any)('file:///wrong.sas') } }
    ;(vscode.window as any).visibleTextEditors = [target]
    ;(vscode.window.showTextDocument as jest.Mock).mockImplementation(async () => {
      ;(vscode.window as any).activeTextEditor = target
      return target
    })
    await new (FormatCommand as any)(async () => jest.fn()).initialise({ subscriptions: [] })
    await mockedRegisterCommand.mock.calls[0][1](target.document.uri)
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(target.document, 2)
    expect(mockedExecuteCommand).toHaveBeenCalledWith('editor.action.formatDocument')
  })

  it('does not format another editor if focus changes while opening the target', async () => {
    const target = { document: { languageId: 'sas', uri: new (vscode.Uri as any)('file:///target.sas') }, viewColumn: 2 }
    ;(vscode.window as any).activeTextEditor = { document: { languageId: 'sas', uri: new (vscode.Uri as any)('file:///wrong.sas') } }
    ;(vscode.window as any).visibleTextEditors = [target]
    ;(vscode.window.showTextDocument as jest.Mock).mockResolvedValue(target)
    await new (FormatCommand as any)(async () => jest.fn()).initialise({ subscriptions: [] })
    await mockedRegisterCommand.mock.calls[0][1](target.document.uri)
    expect(mockedExecuteCommand).not.toHaveBeenCalled()
  })

  it('does nothing when the active editor is not SAS', async () => {
    // The palette can be opened over any editor and the core action formats
    // whatever is active.
    await invokeFormatDocument('javascript')

    expect(mockedExecuteCommand).not.toHaveBeenCalled()
  })

  it('does nothing when no editor is active', async () => {
    await invokeFormatDocument()

    expect(mockedExecuteCommand).not.toHaveBeenCalled()
  })
})
