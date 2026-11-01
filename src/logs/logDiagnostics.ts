import {
  Diagnostic,
  DiagnosticCollection,
  DiagnosticSeverity,
  ExtensionContext,
  OverviewRulerLane,
  Range,
  TextDocument,
  TextEditor,
  TextEditorDecorationType,
  ThemeColor,
  Uri,
  commands,
  languages,
  window,
  workspace
} from 'vscode'
import { LogIssue, isSasLog, parseLog } from '@sasjs/utils/logs'

/** Logs this large are not worth parsing on every keystroke; SAS logs are not usually near it. */
const MAX_LOG_LENGTH = 32 * 1024 * 1024

/** How long a burst of edits waits before the log is parsed again. */
const CHANGE_DEBOUNCE_MS = 300

const isLogDocument = (document: TextDocument): boolean => /\.log$/i.test(document.fileName)

interface Parsed {
  version: number
  issues: LogIssue[]
}

const parsed = new Map<string, Parsed>()
const changeTimers = new Map<string, ReturnType<typeof setTimeout>>()

let collection: DiagnosticCollection | undefined
let errorDecoration: TextEditorDecorationType | undefined
let warningDecoration: TextEditorDecorationType | undefined

/**
 * The diagnostics and decorations exist from the first log onwards rather than
 * from activation, so a log that is already on screen is analysed whether the
 * extension started before it or after it.
 */
const diagnostics = (): DiagnosticCollection =>
  (collection ??= languages.createDiagnosticCollection('SASjs log'))

const errorColour = (): TextEditorDecorationType =>
  (errorDecoration ??= window.createTextEditorDecorationType({
    isWholeLine: true,
    color: new ThemeColor('errorForeground'),
    overviewRulerColor: new ThemeColor('editorOverviewRuler.errorForeground'),
    overviewRulerLane: OverviewRulerLane.Right
  }))

const warningColour = (): TextEditorDecorationType =>
  (warningDecoration ??= window.createTextEditorDecorationType({
    isWholeLine: true,
    color: new ThemeColor('editorWarning.foreground'),
    overviewRulerColor: new ThemeColor('editorOverviewRuler.warningForeground'),
    overviewRulerLane: OverviewRulerLane.Right
  }))

/**
 * Publishes the errors, the warnings and the notable notes of a SAS log as
 * diagnostics, and colours the errors and warnings in the editor.
 *
 * A diagnostic is what puts a line in the Problems panel, which is what makes
 * F8 and Shift+F8 move between them without this extension binding anything;
 * the decorations are what make the same lines readable at a glance. Both come
 * from one parse of one document, and both are addressed from the issue list,
 * so neither path rewrites the log.
 *
 * There is no project test: a log is analysed wherever it lives, because the run
 * that wrote it may have happened in a folder without a sasjsconfig. What is
 * tested is the text - see {@link analyse} - because another tool's `.log` writes
 * the same markers.
 */
export const registerLogDiagnostics = (context: ExtensionContext): void => {
  context.subscriptions.push(
    diagnostics(),
    errorColour(),
    warningColour(),
    workspace.onDidOpenTextDocument((document) => void analyse(document)),
    workspace.onDidSaveTextDocument((document) => void analyse(document)),
    workspace.onDidChangeTextDocument(({ document }) => schedule(document)),
    workspace.onDidCloseTextDocument((document) => clear(document.uri)),
    window.onDidChangeActiveTextEditor((editor) => editor && void analyse(editor.document))
  )

  window.visibleTextEditors.forEach((editor) => void analyse(editor.document))
}

/**
 * The context key the manifest reads to decide whether to show the next and
 * previous buttons in the editor title bar.
 */
export const LOG_EDITOR_KEY = 'sasjsLogEditor'

/**
 * Publishes whether the active editor is a log, so the title-bar buttons show for
 * one and only for one.
 *
 * The manifest could test the filename itself, with `resourceExtname == .log`, but
 * that comparison is case-sensitive while {@link analyse} matches the extension
 * case-insensitively: a `RUN.LOG` would publish diagnostics and show no buttons.
 * One predicate answers both halves.
 */
export const registerLogEditorContext = (context: ExtensionContext): void => {
  const update = (editor: TextEditor | undefined): void =>
    void commands.executeCommand(
      'setContext',
      LOG_EDITOR_KEY,
      !!editor && isLogDocument(editor.document)
    )

  context.subscriptions.push(window.onDidChangeActiveTextEditor(update))

  update(window.activeTextEditor)
}

/**
 * Parses a log and applies the result, replacing whatever was there.
 *
 * A log is analysed wherever it lives, project or not, but only when SAS wrote it:
 * the run that produced it may have happened in a folder without a sasjsconfig -
 * the logs the extension itself writes are the obvious case - and a `.log` from
 * another tool is left alone, since Python's logging and a shell build log both
 * write `ERROR:` at the start of a line. `isSasLog` is what tells them apart.
 *
 * A document that holds neither is cleared rather than left with a stale result
 * from an earlier life.
 */
export const analyse = async (document: TextDocument): Promise<void> => {
  const key = document.uri.toString()

  if (!isLogDocument(document)) {
    clear(document.uri)
    return
  }

  const text = document.getText()

  if (!isSasLog(text)) {
    clear(document.uri)
    return
  }

  const cached = parsed.get(key)

  if (cached && cached.version === document.version) {
    decorate(document, cached.issues)
    return
  }

  if (text.length > MAX_LOG_LENGTH) {
    clear(document.uri)
    return
  }

  const issues = parseLog(text)

  parsed.set(key, { version: document.version, issues })
  diagnostics().set(document.uri, issues.map(toDiagnostic))
  decorate(document, issues)
}

/** Drops everything published for a log, and the parse it came from. */
export const clear = (uri: Uri): void => {
  const key = uri.toString()

  parsed.delete(key)

  const timer = changeTimers.get(key)
  if (timer) {
    clearTimeout(timer)
    changeTimers.delete(key)
  }

  diagnostics().delete(uri)
}

/** Coalesces the edits of a burst into one parse, because a log can be large. */
const schedule = (document: TextDocument): void => {
  const key = document.uri.toString()
  const timer = changeTimers.get(key)

  if (timer) {
    clearTimeout(timer)
  }

  changeTimers.set(
    key,
    setTimeout(() => {
      changeTimers.delete(key)
      void analyse(document)
    }, CHANGE_DEBOUNCE_MS)
  )
}

/**
 * The diagnostic covers the marker and the text after it on the line it starts,
 * because that is the line a reader has to look at. The lines SAS wrapped are
 * part of the message and are reported in it, not underlined.
 */
const toDiagnostic = (issue: LogIssue): Diagnostic => {
  const diagnostic = new Diagnostic(
    new Range(issue.line, issue.column, issue.line, issue.endColumn),
    issue.message,
    severityOf(issue)
  )

  diagnostic.source = 'SASjs log'
  if (issue.code) {
    diagnostic.code = issue.code
  }

  return diagnostic
}

/**
 * Colours the errors and the warnings, and not the notable notes: a log carries
 * enough of them that colouring them too would drown the two lines that stopped
 * the run. They are still in the Problems panel, under Information.
 */
const decorate = (document: TextDocument, issues: LogIssue[]): void => {
  const editors = window.visibleTextEditors.filter(
    (editor) => editor.document.uri.toString() === document.uri.toString()
  )

  editors.forEach((editor) => {
    editor.setDecorations(
      errorColour(),
      issues.filter((issue) => issue.severity === 'error').map(toDecorationRange)
    )

    editor.setDecorations(
      warningColour(),
      issues.filter((issue) => issue.severity === 'warning').map(toDecorationRange)
    )
  })
}

/**
 * A notable note is Information, which is the severity VS Code groups under its
 * own filter in the Problems panel - the notes section a reader scans after the
 * errors and warnings.
 */
const severityOf = (issue: LogIssue): DiagnosticSeverity =>
  issue.severity === 'error'
    ? DiagnosticSeverity.Error
    : issue.severity === 'warning'
    ? DiagnosticSeverity.Warning
    : DiagnosticSeverity.Information

/** A whole-line range over the issue and every line SAS wrapped into it. */
const toDecorationRange = (issue: LogIssue): Range =>
  new Range(issue.line, 0, issue.endLine, 0)
