import * as vscode from 'vscode'
import { lintFile, Diagnostic, Severity, LintConfig } from '@sasjs/lint'
import { getLintConfig } from '../utils/getLintConfig'
import {
  clearLintConfigError,
  reportLintConfigError
} from '../utils/reportLintConfigError'

let diagnosticCollection: vscode.DiagnosticCollection

export const lint = async (textEditor?: vscode.TextEditor): Promise<void> => {
  if (!textEditor) {
    return
  }

  if (vscode.workspace.workspaceFolders?.length) {
    process.chdir(vscode.workspace.workspaceFolders[0].uri.fsPath)
  }

  let lintConfig: LintConfig

  try {
    lintConfig = await getLintConfig()
    clearLintConfigError()
  } catch (error) {
    // The project's rules did not load, so the rules in force are not the rules
    // it states. Say so and mark nothing: a Problems panel filled from a
    // configuration nobody wrote is worse than an empty one.
    if (diagnosticCollection) {
      diagnosticCollection.clear()
    }

    reportLintConfigError(error)

    return
  }

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
