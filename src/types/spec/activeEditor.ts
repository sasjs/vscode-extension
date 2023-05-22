export interface MockedActiveEditor {
  document: { getText: () => string }
  selection: { start: { line: number }; end: { line: number } }
  edit: () => void
}
