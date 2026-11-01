/**
 * Asserts the two navigation commands: that they step through the errors and
 * warnings of the log in the active editor, that they wrap at either end, and
 * that a log with nothing in it says so instead of moving the cursor.
 *
 * As with the diagnostics spec the parser is the real one; the vscode module is
 * jest-mocked so the commands run without an editor.
 */

const registered = new Map<string, () => Promise<void>>()
const showInformationMessage = jest.fn()
const revealRange = jest.fn()

class Position {
  constructor(public line: number, public character: number) {}
}

class Range {
  constructor(public start: Position, public end: Position) {}
}

class Selection {
  constructor(public anchor: Position, public active: Position) {}
}

jest.mock('vscode', () => ({
  Position,
  Range,
  Selection,
  TextEditorRevealType: { InCenter: 2 },
  commands: {
    registerCommand: (id: string, handler: () => Promise<void>) => {
      registered.set(id, handler)

      return { dispose: jest.fn() }
    }
  },
  window: {
    activeTextEditor: undefined,
    showInformationMessage
  }
}))

import { window } from 'vscode'
import { LogIssueCommand } from './LogIssueCommand'

const LOG = [
  '1    data want;',
  '2      x = age / 0;',
  '3    run;',
  'WARNING: Division by zero detected at line 2 column 11.',
  'ERROR: File WORK.MISSING_DS.DATA does not exist.',
  ''
].join('\n')

const editor = (text: string, cursorLine: number) => {
  const selection = new Selection(new Position(cursorLine, 0), new Position(cursorLine, 0))

  return {
    document: { getText: () => text, fileName: 'run.log' },
    selection,
    revealRange
  }
}

const context = { subscriptions: [] as unknown[] } as any

const run = async (direction: 'next' | 'previous', activeEditor: unknown) => {
  ;(window as any).activeTextEditor = activeEditor

  const command = new LogIssueCommand(context, direction)
  command.initialise()

  const handler = registered.get(
    direction === 'next'
      ? 'sasjs-for-vscode.nextLogIssue'
      : 'sasjs-for-vscode.previousLogIssue'
  )

  await handler!()

  return command
}

describe('LogIssueCommand', () => {
  beforeEach(() => {
    registered.clear()
    revealRange.mockClear()
    showInformationMessage.mockClear()
  })

  it('registers the command its direction is bound to', async () => {
    await run('next', editor(LOG, 0))
    await run('previous', editor(LOG, 0))

    expect([...registered.keys()]).toEqual([
      'sasjs-for-vscode.nextLogIssue',
      'sasjs-for-vscode.previousLogIssue'
    ])
  })

  it('moves the cursor to the next error or warning', async () => {
    const activeEditor = editor(LOG, 0)
    await run('next', activeEditor)

    expect(activeEditor.selection.active).toEqual({ line: 3, character: 0 })
    expect(revealRange).toHaveBeenCalledTimes(1)
  })

  it('steps to the error after the warning it is sitting on', async () => {
    const activeEditor = editor(LOG, 3)
    await run('next', activeEditor)

    expect(activeEditor.selection.active).toEqual({ line: 4, character: 0 })
  })

  it('wraps to the first issue at the end of the log', async () => {
    const activeEditor = editor(LOG, 4)
    await run('next', activeEditor)

    expect(activeEditor.selection.active).toEqual({ line: 3, character: 0 })
  })

  it('steps back and wraps to the last issue at the start', async () => {
    const fromFirst = editor(LOG, 3)
    await run('previous', fromFirst)
    expect(fromFirst.selection.active).toEqual({ line: 4, character: 0 })

    const fromTop = editor(LOG, 0)
    await run('previous', fromTop)
    expect(fromTop.selection.active).toEqual({ line: 4, character: 0 })
  })

  it('says so when the log has no errors or warnings', async () => {
    const activeEditor = editor('NOTE: Nothing to report.\n', 0)
    await run('next', activeEditor)

    expect(showInformationMessage).toHaveBeenCalledTimes(1)
    expect(activeEditor.selection.active).toEqual({ line: 0, character: 0 })
    expect(revealRange).not.toHaveBeenCalled()
  })
})
