import { window, ExtensionContext, commands, Range } from 'vscode'
import { MockedActiveEditor } from '../../types/spec/activeEditor'

export class AddRemoveCommentCommand {
  private commentStartRegExp = /^\/\*\s{0,1}/
  private commentEndRegExp = /\s{0,1}\*\/$/

  constructor(private context: ExtensionContext) {}

  initialise = () => {
    const commentOutLineCommand = commands.registerCommand(
      'sasjs-for-vscode.addRemoveComment',
      () => this.addRemoveComment()
    )

    this.context.subscriptions.push(commentOutLineCommand)
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
      const lines = text.split(`\n`) || []

      const editedLines = lines
        .reduce((acc: string[], line: string, i: number) => {
          if (i >= start.line && i <= end.line) {
            acc.push(this.addRemoveCommentToLine(line))
          }

          return acc
        }, [])
        .join(`\n`)

      // INFO: exit point for unit test
      if (mockedActiveEditor) {
        return editedLines
      }

      activeEditor.edit((editBuilder) => {
        const range = new Range(start.line, 0, end.line, lines[end.line].length)

        editBuilder.replace(range, editedLines)
      })

      // INFO: move cursor to the middle of the empty comment
      if (editedLines.length === 6 && this.isWrappedWithComments(editedLines)) {
        commands.executeCommand('cursorMove', {
          to: 'left',
          by: 'character',
          value: 3
        })
      }
    }
  }
}
