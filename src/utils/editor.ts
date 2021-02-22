import { window } from 'vscode'

export const isTextSelected = () => {
  const selection = window.activeTextEditor?.selection
  return (
    selection &&
    (selection.start.character !== selection.end.character ||
      selection.start.line !== selection.end.line)
  )
}

export const getEditorContent = () => {
  return isTextSelected()
    ? window.activeTextEditor?.document.getText(
        window.activeTextEditor?.selection
      )
    : window.activeTextEditor?.document.getText()
}
