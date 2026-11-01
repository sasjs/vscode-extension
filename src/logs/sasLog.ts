/**
 * The SAS log parser, loaded once.
 *
 * @sasjs/sas-language publishes ES modules, and this extension is a CommonJS
 * bundle, so the parser arrives through a dynamic import rather than a static
 * one: a static import of an ES module is a compile error under `module:
 * node16`, and the type-only form of it needs a `resolution-mode` attribute.
 * The module is two pure functions with no dependencies, so there is nothing to
 * gain from loading it lazily beyond satisfying that boundary, and everything
 * to gain from loading it only once.
 */
type LogParser = typeof import('@sasjs/sas-language/logs', {
  with: { 'resolution-mode': 'import' }
})

/** An ERROR or WARNING in a SAS log, as the parser reports it. */
export type LogIssue = ReturnType<LogParser['parseLog']>[number]

/** Which way a search for the next issue travels. */
export type IssueDirection = NonNullable<
  Parameters<LogParser['nextIssue']>[2]
>

let parser: Promise<LogParser> | undefined

export const logParser = (): Promise<LogParser> =>
  (parser ??= import('@sasjs/sas-language/logs'))
