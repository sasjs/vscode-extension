import { formatText } from '@sasjs/lint'
import { languages, TextDocument, TextEdit, Range } from 'vscode'
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

let engine: Promise<Reprint> | undefined

/**
 * The layout engine, loaded the first time a document is formatted.
 *
 * `@sasjs/sas-language` publishes ES modules, and this extension is compiled to
 * CommonJS, so the import has to be dynamic - a static one is not something the
 * compiler can carry across that boundary. Loading it here rather than at the top
 * of the file also keeps activation cheap: the module graph is ~25 ms and nothing
 * needs it until someone asks for a format.
 *
 * The promise is kept, so a second format reuses it and a failed load is not
 * retried on every keystroke.
 */
const getEngine = (): Promise<Reprint> =>
  (engine ??= import('@sasjs/sas-language/format').then(
    (module) => module.formatText
  ))

export class FormatCommand {
  /**
   * `loadEngine` is injectable because jest cannot run a dynamic `import()` at
   * all - it answers "A dynamic import callback was invoked without
   * --experimental-vm-modules" - so a test cannot reach the engine through the
   * default loader. Passing one is also how the failure path gets tested without
   * a broken install.
   */
  constructor(private loadEngine: () => Promise<Reprint> = getEngine) {}

  async initialise() {
    // Captured because `this` inside the provider below is the provider itself.
    const loadEngine = this.loadEngine

    languages.registerDocumentFormattingEditProvider('sas', {
      async provideDocumentFormattingEdits(
        document: TextDocument
      ): Promise<TextEdit[]> {
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
        // did before the engine existed.
        let reprint: Reprint | undefined
        try {
          reprint = await loadEngine()
        } catch (error) {
          // A broken install leaves the formatter rule-only rather than throwing
          // at the user: the document still gets its header and wrapping.
          reprint = undefined
        }

        const formattedText = await formatText(
          document.getText(),
          lintConfig,
          reprint ? { reprint } : {}
        )

        return [TextEdit.replace(fullRange, formattedText)]
      }
    })
  }
}
