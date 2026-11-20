import { readFileSync } from 'fs'
import { join } from 'path'

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))

test('contributes a SAS editor title button for formatting', () => {
  const id = 'sasjs-for-vscode.formatDocument'
  // `list-flat` is four left-aligned rules, the codicon nearest to the
  // FormatAlignLeft icon Studio's own docs name for this button.
  expect(manifest.contributes.commands).toContainEqual({
    command: id,
    title: 'SASjs: Format',
    icon: '$(list-flat)',
    enablement: 'isWorkspaceOpened && editorLangId == sas'
  })
  // After Fix Lint Issues, as the two sit in Studio's file menu.
  expect(manifest.contributes.menus['editor/title']).toContainEqual({
    command: id,
    group: 'navigation@6',
    when: 'editorLangId == sas && isWorkspaceOpened'
  })
})
