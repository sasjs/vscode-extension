import * as vscode from 'vscode'
import {
  lintText,
  isIgnored,
  applyLintOverride,
  Diagnostic,
  Severity,
  LintConfig
} from '@sasjs/lint'
import { getLintConfig } from '../utils/getLintConfig'
import {
  clearLintConfigError,
  reportLintConfigError
} from '../utils/reportLintConfigError'

let diagnosticCollection: vscode.DiagnosticCollection
let lintGeneration = 0
let lastLintError: string | undefined

export const lint = async (textEditor?: vscode.TextEditor): Promise<void> => {
  if (!textEditor) {
    return
  }

  const generation = ++lintGeneration
  const document = textEditor.document
  const version = document.version
  const text = document.getText()
  const isCurrent = () =>
    generation === lintGeneration && document.version === version

  if (vscode.workspace.workspaceFolders?.length) {
    process.chdir(vscode.workspace.workspaceFolders[0].uri.fsPath)
  }

  let lintConfig: LintConfig

  try {
    lintConfig = await getLintConfig()
    if (!isCurrent()) {
      return
    }
    clearLintConfigError()
  } catch (error) {
    if (!isCurrent()) {
      return
    }
    // The project's rules did not load, so the rules in force are not the rules
    // it states. Say so and mark nothing: a Problems panel filled from a
    // configuration nobody wrote is worse than an empty one.
    if (diagnosticCollection) {
      diagnosticCollection.clear()
    }

    reportLintConfigError(error)

    return
  }

  // lintFile reads the saved file. Lint the editor snapshot instead, while
  // retaining lintFile's ignore handling and path-specific rules for real files.
  let sasjsDiagnostics: Diagnostic[]
  try {
    const filePath = document.uri.fsPath
    const isFile = document.uri.scheme === 'file'
    const ignored = isFile && (await isIgnored(filePath, lintConfig))
    if (!isCurrent()) {
      return
    }

    if (ignored) {
      sasjsDiagnostics = []
    } else {
      // The public lintText API has no path argument. Run the public path-rule
      // interface with the same effective config that lintFile would use.
      const effectiveConfig = isFile
        ? applyLintOverride(text, lintConfig)
        : undefined
      const pathDiagnostics = effectiveConfig
        ? effectiveConfig.pathLintRules.flatMap((rule) =>
            rule.test(filePath, effectiveConfig)
          )
        : []
      sasjsDiagnostics = [...pathDiagnostics, ...(await lintText(text, lintConfig))]
    }
    if (!isCurrent()) {
      return
    }
    lastLintError = undefined
  } catch (error) {
    if (!isCurrent()) {
      return
    }
    diagnosticCollection?.delete(document.uri)
    const message = `SASjs lint failed: ${error instanceof Error ? error.message : String(error)}`
    if (message !== lastLintError) {
      lastLintError = message
      vscode.window.showErrorMessage(message)
    }
    return
  }

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
  lintGeneration++
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
