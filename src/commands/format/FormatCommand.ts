import { formatText } from '@sasjs/lint'
import { languages, TextDocument, TextEdit, Range } from 'vscode'
import { getLintConfig } from '../../utils/getLintConfig'

export class FormatCommand {
  constructor() {}

  async initialise() {
    languages.registerDocumentFormattingEditProvider('sas', {
      async provideDocumentFormattingEdits(
        document: TextDocument
      ): Promise<TextEdit[]> {
        const fullRange = new Range(0, 0, document.lineCount, 0)
        const lintConfig = await getLintConfig()
        const formattedText = await formatText(document.getText(), lintConfig)
        return [TextEdit.replace(fullRange, formattedText)]
      }
    })
  }
}
