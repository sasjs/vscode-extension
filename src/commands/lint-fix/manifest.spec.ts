import { readFileSync } from 'fs'
import { join } from 'path'

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))

test('contributes a SAS editor title button for fixing lint issues', () => {
  const id = 'sasjs-for-vscode.fixLintIssues'
  expect(manifest.contributes.commands).toContainEqual({
    command: id,
    title: 'SASjs: Fix Lint Issues',
    icon: '$(lightbulb)',
    enablement: 'isWorkspaceOpened && editorLangId == sas'
  })
  expect(manifest.contributes.menus['editor/title']).toContainEqual({
    command: id,
    group: 'navigation@6',
    when: 'editorLangId == sas && isWorkspaceOpened'
  })
})
