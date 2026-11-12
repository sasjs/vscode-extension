import { formatText } from '@sasjs/lint'
import { languages, TextDocument, TextEdit, Range } from 'vscode'
import { getLintConfig } from '../../utils/getLintConfig'
import {
  clearLintConfigError,
  reportLintConfigError
} from '../../utils/reportLintConfigError'

export class FormatCommand {
  constructor() {}

  async initialise() {
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

        const formattedText = await formatText(document.getText(), lintConfig)

        return [TextEdit.replace(fullRange, formattedText)]
      }
    })
  }
}
