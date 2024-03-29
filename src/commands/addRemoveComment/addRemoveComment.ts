import {
  window,
  ExtensionContext,
  commands,
  Range,
  Selection,
  Position
} from 'vscode'
import { MockedActiveEditor } from '../../types/spec/activeEditor'
import { isWindows, getLineEnding } from '@sasjs/utils'

export class AddRemoveCommentCommand {
  private commentStartRegExp = /^\/\*\s{0,1}/
  private commentEndRegExp = /\s{0,1}\*\/$/
  private comment = '/*  */'

  constructor(private context: ExtensionContext) {}

  initialise = () => {
    const addRemoveCommentCommand = commands.registerCommand(
      'sasjs-for-vscode.addRemoveComment',
      () => this.addRemoveComment()
    )

    this.context.subscriptions.push(addRemoveCommentCommand)
  }

  private isWrappedWithComments(line: string) {
    return (
      this.commentStartRegExp.test(line) && this.commentEndRegExp.test(line)
    )
  }

  private addRemoveCommentToLine(line: string) {
    const commentStartRegExp = /^\/\*\s{0,1}/
    const commentEndRegExp = /\s{0,1}\*\/$/

    const lineWithoutComments = line
      .replace(commentStartRegExp, '')
      .replace(commentEndRegExp, '')

    if (this.isWrappedWithComments(line)) {
      return lineWithoutComments
    } else {
      return `/* ${lineWithoutComments} */`
    }
  }

  private addRemoveComment = async (
    mockedActiveEditor?: MockedActiveEditor // INFO: used for unit tests
  ) => {
    const activeEditor = mockedActiveEditor || window.activeTextEditor

    if (activeEditor) {
      const { start, end } = activeEditor.selection
      const text = activeEditor.document.getText()

      const lineEnding = getLineEnding(text)

      const lines = text.split(lineEnding) || []

      const editedLines = lines
        .reduce((acc: string[], line: string, i: number) => {
          if (i >= start.line && i <= end.line) {
            acc.push(this.addRemoveCommentToLine(line))
          }

          return acc
        }, [])
        .join(lineEnding)

      // INFO: exit point for unit test
      if (mockedActiveEditor) {
        return editedLines
      }

      activeEditor.edit((editBuilder) => {
        const range = new Range(start.line, 0, end.line, lines[end.line].length)

        editBuilder.replace(range, editedLines)

        // INFO: select all updated lines
        const lastLine = lines[end.line]
        const lastUpdatedLineLength =
          lastLine.length +
          (this.isWrappedWithComments(lastLine) ? 0 : this.comment.length)

        const selectionStart = new Position(start.line, 0)
        const selectionEnd = new Position(end.line, lastUpdatedLineLength)

        activeEditor.selection = new Selection(selectionStart, selectionEnd)
      })

      // INFO: move cursor to the middle of the empty comment
      if (editedLines === this.comment) {
        if (isWindows()) {
          // INFO: on Windows the courser is moved only when selection is true.
          commands
            .executeCommand('cursorMove', {
              to: 'left',
              by: 'halfLine',
              value: 1,
              select: true
            })
            .then(() => {
              // INFO: clear selection after cursor movement
              const position = activeEditor.selection.end as Position

              activeEditor.selection = new Selection(position, position)
            })
        } else {
          commands.executeCommand('cursorMove', {
            to: 'left',
            by: 'character',
            value: 3
          })
        }
      }
    }
  }
}
