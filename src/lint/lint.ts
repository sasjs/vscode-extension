import * as vscode from 'vscode'
import { lintFile, Diagnostic, Severity } from '@sasjs/lint'
import { getLintConfig } from '../utils/getLintConfig'

let diagnosticCollection: vscode.DiagnosticCollection

export const lint = async (textEditor?: vscode.TextEditor): Promise<void> => {
  if (!textEditor) {
    return
  }

  if (vscode.workspace.workspaceFolders?.length) {
    process.chdir(vscode.workspace.workspaceFolders[0].uri.fsPath)
  }

  const lintConfig = await getLintConfig()
  const sasjsDiagnostics = await lintFile(
    textEditor.document.uri.fsPath,
    lintConfig
  )

  const diagnostics = mapDiagnostics(sasjsDiagnostics)

  if (!diagnosticCollection) {
    diagnosticCollection =
      vscode.languages.createDiagnosticCollection('SASjs Lint')
  } else {
    diagnosticCollection.clear()
  }

  diagnosticCollection.set(textEditor.document.uri, diagnostics)
}

export const clearLintIssues = () => {
  if (diagnosticCollection) {
    diagnosticCollection.clear()
  }
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
