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
  ConfigurationTarget,
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

/** Above this many lines a log is large enough that a parse costs real time. */
const LARGE_LOG_LINES = 100_000

/**
 * How long a burst waits on a large log. A log being written by a running job
 * raises a change event per write, and re-parsing half a megabyte of lines on
 * each of them would keep the extension host busy for the length of the run;
 * waiting a couple of seconds instead keeps the colours behind the file without
 * spending the whole session on it.
 */
const LARGE_LOG_DEBOUNCE_MS = 2000

const isLogDocument = (document: TextDocument): boolean =>
  /\.log$/i.test(document.fileName)

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
    window.onDidChangeActiveTextEditor(
      (editor) => editor && void analyse(editor.document)
    )
  )

  window.visibleTextEditors.forEach((editor) => void analyse(editor.document))
}

/**
 * The context key the manifest reads to decide whether to show the next and
 * previous buttons in the editor title bar.
 */
export const LOG_EDITOR_KEY = 'sasjsLogEditor'

/** The context key that says whether the notable notes are being listed. */
export const LOG_NOTES_KEY = 'sasjsLogNotes'

/** The setting that decides whether the notable notes are listed. */
export const LOG_NOTES_SETTING = 'logNotableNotes'

const CONFIG_SECTION = 'sasjs-for-vscode'

/**
 * Whether the notable notes are listed, from the project's settings.
 *
 * The setting is scoped to the resource, so a project that finds the notes noisy
 * can turn them off in its own `.vscode/settings.json` without silencing them
 * everywhere. Default true: a log is read for what went wrong quietly as well as
 * for what stopped, and that has been the behaviour since the feature shipped.
 */
export const listsNotes = (): boolean =>
  workspace
    .getConfiguration(CONFIG_SECTION)
    .get<boolean>(LOG_NOTES_SETTING, true)

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
  const setKey = (key: string, value: boolean): void => {
    commands
      .executeCommand('setContext', key, value)
      .then(undefined, (error: unknown) =>
        // A rejected setContext otherwise vanishes, leaving the buttons on their
        // previous value with nothing to say why.
        process.outputChannel.appendLine(
          `SASjs: could not update ${key} - ${String(error)}`
        )
      )
  }

  const update = (editor: TextEditor | undefined): void =>
    setKey(LOG_EDITOR_KEY, !!editor && isLogDocument(editor.document))

  const updateNotes = (): void => setKey(LOG_NOTES_KEY, listsNotes())

  context.subscriptions.push(
    window.onDidChangeActiveTextEditor(update),
    workspace.onDidChangeConfiguration((event) => {
      if (
        !event.affectsConfiguration(`${CONFIG_SECTION}.${LOG_NOTES_SETTING}`)
      ) {
        return
      }

      updateNotes()

      // Re-publish from the cached parse, so the Problems list follows the
      // setting without the log being read again.
      workspace.textDocuments.forEach((document) => void analyse(document))
    })
  )

  update(window.activeTextEditor)
  updateNotes()
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
 * from an earlier life, and the verdict is remembered against the document's
 * version: a log being written raises an event per write, and a document that is
 * not a log, or is too large to parse, must not be read and scanned again for
 * every one of them.
 */
export const analyse = async (document: TextDocument): Promise<void> => {
  const key = document.uri.toString()

  if (!isLogDocument(document)) {
    clear(document.uri)
    return
  }

  // The version is known without reading the text, so an unchanged document is
  // answered from the last parse - including one that was judged not to be a log,
  // which is why `[]` is cached rather than nothing.
  const cached = parsed.get(key)

  // The parse is reused, but the diagnostics are published again: the listing is
  // a setting, and a change to it re-analyses from this cache rather than parsing
  // the log a second time.
  if (cached && cached.version === document.version) {
    publish(document, cached.issues)
    return
  }

  const text = document.getText()

  if (text.length > MAX_LOG_LENGTH || !isSasLog(text)) {
    clear(document.uri)
    parsed.set(key, { version: document.version, issues: [] })
    return
  }

  const issues = parseLog(text)

  parsed.set(key, { version: document.version, issues })
  publish(document, issues)
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
    setTimeout(
      () => {
        changeTimers.delete(key)
        void analyse(document)
      },
      document.lineCount > LARGE_LOG_LINES
        ? LARGE_LOG_DEBOUNCE_MS
        : CHANGE_DEBOUNCE_MS
    )
  )
}

/**
 * Publishes a parse as diagnostics and colours the editor, honouring the setting
 * that decides whether the notable notes are listed.
 *
 * The filter is applied here rather than in the parse so that flipping the setting
 * costs nothing but this pass: the cached issues are the same either way.
 */
const publish = (document: TextDocument, issues: LogIssue[]): void => {
  const listed = listsNotes()
    ? issues
    : issues.filter((issue) => issue.severity !== 'note')

  diagnostics().set(document.uri, listed.map(toDiagnostic))
  decorate(document, issues)
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
      issues
        .filter((issue) => issue.severity === 'error')
        .map(toDecorationRange)
    )

    editor.setDecorations(
      warningColour(),
      issues
        .filter((issue) => issue.severity === 'warning')
        .map(toDecorationRange)
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

/**
 * The two commands behind the single button in the editor title bar, one per state
 * of the setting.
 *
 * VSCode has no toggle menu item: an entry is a command, so a button that means
 * "hide" while the notes are listed and "show" while they are not is two
 * commands, each gated on the context key that says which state the reader is in.
 * The icon shows the action, the tooltip names it, and the setting is what both
 * of them write.
 */
export const registerLogNotesCommands = (context: ExtensionContext): void => {
  const set = (value: boolean) => async (): Promise<void> => {
    await workspace
      .getConfiguration(CONFIG_SECTION)
      .update(LOG_NOTES_SETTING, value, ConfigurationTarget.Workspace)
  }

  context.subscriptions.push(
    commands.registerCommand('sasjs-for-vscode.showLogNotes', set(true)),
    commands.registerCommand('sasjs-for-vscode.hideLogNotes', set(false))
  )
}
