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

        let formattedText: string

        try {
          const lintConfig = await getLintConfig()
          clearLintConfigError()
          formattedText = await formatText(document.getText(), lintConfig)
        } catch (error) {
          // Formatting with rules the project did not ask for is a silent
          // rewrite of the file, so a configuration that will not load leaves
          // the document untouched and says why.
          reportLintConfigError(error)

          return []
        }

        return [TextEdit.replace(fullRange, formattedText)]
      }
    })
  }
}
