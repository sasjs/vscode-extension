import { formatText, isIgnored } from '@sasjs/lint'
import * as vscode from 'vscode'
import { getLintConfig } from '../../utils/getLintConfig'

export function registerLintFixCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'sasjs-for-vscode.fixLintIssues',
      async (resource?: unknown) => {
        // VS Code exports URI.isUri at runtime, but its public typings omit it.
        if (resource !== undefined && !(vscode.Uri as typeof vscode.Uri & {
          isUri(value: unknown): value is vscode.Uri
        }).isUri(resource)) {
          vscode.window.showWarningMessage('Lint fixes were not applied because the selected resource is invalid.')
          return
        }

        const editor = vscode.window.activeTextEditor
        if (!editor || editor.document.languageId !== 'sas') {
          return
        }

        // A title action may target another editor group; never fix a different
        // buffer from the one whose title was clicked.
        if (resource && resource.toString() !== editor.document.uri.toString()) {
          vscode.window.showWarningMessage(
            'Activate the selected SAS editor before fixing its lint issues.'
          )
          return
        }

        const document = editor.document
        const version = document.version
        const text = document.getText()
        try {
          const config = await getLintConfig()
          if (document.uri.scheme === 'file' && await isIgnored(document.uri.fsPath, config)) {
            vscode.window.showWarningMessage('Lint fixes were not applied because this file is ignored.')
            return
          }
          const fixed = await formatText(text, config)
          if (
            document.isClosed ||
            document.version !== version ||
            vscode.window.activeTextEditor !== editor ||
            document.languageId !== 'sas'
          ) {
            vscode.window.showWarningMessage(
              'Lint fixes were not applied because the document or active editor changed. Please try again.'
            )
            return
          }
          if (fixed === text) {
            return
          }
          const applied = await editor.edit((edit) => {
            edit.replace(
              new vscode.Range(new vscode.Position(0, 0), document.positionAt(text.length)),
              fixed
            )
          })
          if (!applied) {
            vscode.window.showErrorMessage('Could not apply lint fixes to the document.')
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          vscode.window.showErrorMessage(`Could not fix lint issues: ${message}`)
        }
      }
    )
  )
}
