import * as vscode from 'vscode'
import { lint, Diagnostic, Severity } from '@sasjs/lint'

let diagnosticCollection: vscode.DiagnosticCollection

export const lintText = async (
  textEditor?: vscode.TextEditor
): Promise<void> => {
  if (!textEditor) {
    return
  }

  const sasjsDiagnostics = await lint(textEditor.document.getText())

  const diagnostics = mapDiagnostics(sasjsDiagnostics)

  if (!diagnosticCollection) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection(
      'SASjs Lint'
    )
  } else {
    diagnosticCollection.clear()
  }

  diagnosticCollection.set(textEditor.document.uri, diagnostics)
}

const mapDiagnostics = (
  sasjsDiagnostics: Diagnostic[]
): vscode.Diagnostic[] => {
  return sasjsDiagnostics.map((diagnostic) => {
    return {
      range: new vscode.Range(
        new vscode.Position(
          diagnostic.lineNumber - 1,
          diagnostic.startColumnNumber - 1
        ),
        new vscode.Position(
          diagnostic.lineNumber - 1,
          diagnostic.endColumnNumber
        )
      ),
      message: diagnostic.message,
      severity: mapSeverity(diagnostic.severity),
      source: 'SASjs Lint'
    }
  })
}

const mapSeverity = (severity: Severity): vscode.DiagnosticSeverity => {
  return severity === Severity.Info
    ? vscode.DiagnosticSeverity.Information
    : severity === Severity.Warning
    ? vscode.DiagnosticSeverity.Warning
    : vscode.DiagnosticSeverity.Error
}
