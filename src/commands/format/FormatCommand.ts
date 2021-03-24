import { languages, TextDocument, TextEdit } from 'vscode'

export class FormatCommand {
  constructor() {}

  async initialise() {
    languages.registerDocumentFormattingEditProvider('sas', {
      provideDocumentFormattingEdits(
        document: TextDocument
      ): TextEdit[] | undefined {
        return
      }
    })
  }
}
