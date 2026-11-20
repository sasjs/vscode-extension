import { readFileSync } from 'fs'
import { join } from 'path'

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))

test('contributes a SAS editor title button for fixing lint issues', () => {
  const id = 'sasjs-for-vscode.fixLintIssues'
  // The wand is what Studio's own docs name as the icon for this button.
  expect(manifest.contributes.commands).toContainEqual({
    command: id,
    title: 'SASjs: Fix Lint Issues',
    icon: '$(wand)',
    enablement: 'isWorkspaceOpened && editorLangId == sas'
  })
  // Ahead of Format, as the two sit in Studio's file menu.
  expect(manifest.contributes.menus['editor/title']).toContainEqual({
    command: id,
    group: 'navigation@5',
    when: 'editorLangId == sas && isWorkspaceOpened'
  })
})
