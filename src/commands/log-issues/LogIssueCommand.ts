import {
  ExtensionContext,
  Position,
  Range,
  Selection,
  TextEditorRevealType,
  commands,
  window
} from 'vscode'
import { IssueDirection, logParser } from '../../logs/sasLog'

/**
 * Moves the cursor to the next or the previous error or warning in the log in
 * front of the user, and wraps at either end.
 *
 * This is the "go to the next problem" button the log viewer grows in place of
 * hunting for the word ERROR: it reads the document it is asked about rather
 * than the diagnostics this extension published, so it works on a log that was
 * opened before the extension started, and it starts from the cursor - which is
 * how a reader who has just fixed one problem finds the next one.
 *
 * F8 does the same thing through the Problems panel, at file scope. These
 * commands are the version that needs no panel, and that cycles within one log.
 */
export class LogIssueCommand {
  constructor(
    private context: ExtensionContext,
    private direction: IssueDirection
  ) {}

  initialise = () => {
    this.context.subscriptions.push(
      commands.registerCommand(this.commandId, () => this.execute())
    )
  }

  private get commandId(): string {
    return this.direction === 'next'
      ? 'sasjs-for-vscode.nextLogIssue'
      : 'sasjs-for-vscode.previousLogIssue'
  }

  private execute = async (): Promise<void> => {
    const editor = window.activeTextEditor

    if (!editor) {
      return
    }

    const { document } = editor
    const { nextIssue, parseLog } = await logParser()
    const issues = parseLog(document.getText())
    const issue = nextIssue(issues, editor.selection.active.line, this.direction)

    if (!issue) {
      window.showInformationMessage(
        'SASjs: this log has no errors or warnings.'
      )
      return
    }

    const position = new Position(issue.line, issue.column)

    editor.selection = new Selection(position, position)
    editor.revealRange(
      new Range(position, position),
      TextEditorRevealType.InCenter
    )
  }
}
