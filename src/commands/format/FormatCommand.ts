import { formatText } from '@sasjs/lint'
import {
  languages,
  TextDocument,
  TextEdit,
  Range,
  Uri,
  ExtensionContext,
  commands,
  window
} from 'vscode'
import { getLintConfig } from '../../utils/getLintConfig'
import {
  clearLintConfigError,
  reportLintConfigError
} from '../../utils/reportLintConfigError'

/** The reprint pass, as `@sasjs/lint` expects it. */
type Reprint = (
  text: string,
  options: { keywordCase: 'upper' | 'lower' | 'preserve' }
) => Promise<string>

/**
 * The layout engine, loaded the first time a document is formatted.
 *
 * `@sasjs/sas-language` publishes ES modules, and this extension is compiled to
 * CommonJS, so the import has to be dynamic - a static one is not something the
 * compiler can carry across that boundary. Loading it here rather than at the top
 * of the file also keeps activation cheap: the module graph is ~25 ms and nothing
 * needs it until someone asks for a format.
 *
 * The promise is kept, so a second format reuses it - but only once it has
 * resolved. A rejection is dropped, because the failure may be transient (an
 * upgrade swapping the package under a running window, a load that lost a race)
 * and a kept rejection would leave every later format rule-only until reload.
 * `build.ts` keeps this subpath out of the bundle for the same load to work from
 * an installed extension: bundled into CommonJS, `import.meta.url` is empty and the
 * module rejects on its own data root.
 */
const fromPackage = (): Promise<Reprint> =>
  import('@sasjs/sas-language/format').then((module) => module.formatText)

export class FormatCommand {
  private engine: Promise<Reprint> | undefined

  /**
   * `loadEngine` is injectable because jest cannot run a dynamic `import()` at
   * all - it answers "A dynamic import callback was invoked without
   * --experimental-vm-modules" - so a test cannot reach the engine through the
   * default loader. Passing one is also how the failure path gets tested without
   * a broken install.
   */
  constructor(private loadEngine: () => Promise<Reprint> = fromPackage) {}

  /**
   * The engine for this window, loaded once.
   *
   * A rejection is dropped rather than kept: the failure may be transient (an
   * upgrade swapping the package under a running window, a load that lost a race),
   * and a kept rejection would leave every later format rule-only until reload.
   */
  private getEngine(): Promise<Reprint> {
    return (this.engine ??= this.loadEngine().catch((error) => {
      this.engine = undefined

      throw error
    }))
  }

  async initialise(context: Pick<ExtensionContext, 'subscriptions'>) {
    // Captured because `this` inside the provider below is the provider itself.
    const loadEngine = () => this.getEngine()

    const provider = languages.registerDocumentFormattingEditProvider('sas', {
      async provideDocumentFormattingEdits(
        document: TextDocument
      ): Promise<TextEdit[]> {
        const text = document.getText()
        const fullRange = new Range(0, 0, document.lineCount, 0)

        let lintConfig

        // Only the configuration is guarded: formatting under rules the project
        // did not ask for rewrites the document, so a config that will not load
        // leaves it untouched and says why. A failure inside formatText is a
        // different thing and is left to reach the provider as before.
        try {
          lintConfig = await getLintConfig()
        } catch (error) {
          reportLintConfigError(error)

          return []
        }

        clearLintConfigError()

        // The engine gives the formatter its layout - indentation, statement
        // breaks, keyword case from `.sasjslint`; the rules still run over its
        // output. Without it the rules alone apply, which is what this command
        // did before the engine existed - but the reason is reported rather than
        // swallowed: a silent difference between "no layout configured" and
        // "layout unavailable" is how a broken install survives for months.
        let reprint: Reprint | undefined
        try {
          reprint = await loadEngine()
        } catch (error) {
          reportLintConfigError(error)

          reprint = undefined
        }

        const formattedText = await formatText(
          text,
          lintConfig,
          reprint ? { reprint } : {}
        )

        return [TextEdit.replace(fullRange, formattedText)]
      }
    })

    context.subscriptions.push(provider)
    const command = commands.registerCommand('sasjs-for-vscode.formatDocument', async (resource?: unknown) => {
      if (resource !== undefined) {
        // The title menu identifies a resource, not necessarily the focused
        // editor. Never fall back to formatting a different active document.
        // VS Code exports URI.isUri at runtime, but its public typings omit it.
        if (!(Uri as typeof Uri & { isUri(value: unknown): value is Uri }).isUri(resource)) {
          window.showWarningMessage('Formatting was not applied because the selected resource is invalid.')
          return
        }

        if (window.activeTextEditor?.document.uri.toString() !== resource.toString()) {
          const target = window.visibleTextEditors.find(
            (editor) => editor.document.uri.toString() === resource.toString()
          )
          if (!target) {
            window.showWarningMessage('Activate the selected SAS editor and try again.')
            return
          }
          if (target.document.languageId !== 'sas') {return}
          await window.showTextDocument(target.document, target.viewColumn)
        }
        if (window.activeTextEditor?.document.uri.toString() !== resource.toString()) {return}
      }

      if (window.activeTextEditor?.document.languageId !== 'sas') {return}
      await commands.executeCommand('editor.action.formatDocument')
    })
    context.subscriptions.push(command)
  }
}
