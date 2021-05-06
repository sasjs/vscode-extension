import { formatText } from '@sasjs/lint'
import { languages, TextDocument, TextEdit, Range } from 'vscode'

export class FormatCommand {
  constructor() {}

  async initialise() {
    languages.registerDocumentFormattingEditProvider('sas', {
      async provideDocumentFormattingEdits(
        document: TextDocument
      ): Promise<TextEdit[]> {
        const fullRange = new Range(0, 0, document.lineCount, 0)
        const formattedText = await formatText(document.getText())
        return [TextEdit.replace(fullRange, formattedText)]
      }
    })
  }
}
