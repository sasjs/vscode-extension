import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

suite('SAS lint and formatting controls', () => {
  test('lint fixes work on unsaved edits without saving', async function () {
    this.timeout(30000)
    const root = vscode.workspace.workspaceFolders![0].uri.fsPath
    const file = path.join(root, 'live-lint-control.sas')
    const saved = 'data example;\nrun;\n'
    fs.writeFileSync(file, saved)
    try {
      const extension = vscode.extensions.getExtension('SASjs.sasjs-for-vscode')
      assert.ok(extension)
      await extension.activate()
      const doc = await vscode.workspace.openTextDocument(file)
      const editor = await vscode.window.showTextDocument(doc)
      await editor.edit((edit) => edit.insert(new vscode.Position(0, 13), '  '))
      assert.strictEqual(doc.isDirty, true)
      assert.strictEqual(fs.readFileSync(file, 'utf8'), saved)

      const deadline = Date.now() + 15000
      while (Date.now() < deadline) {
        const found = vscode.languages.getDiagnostics(doc.uri).some(
          (d) => d.source === 'SASjs Lint' && d.message === 'Line contains trailing spaces'
        )
        if (found) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      assert.ok(vscode.languages.getDiagnostics(doc.uri).some(
        (d) => d.source === 'SASjs Lint' && d.message === 'Line contains trailing spaces'
      ), 'lint sees unsaved text')

      await vscode.commands.executeCommand('sasjs-for-vscode.fixLintIssues', doc.uri)
      assert.ok(!doc.getText().includes('example;  '), 'rules remove trailing spaces')
      assert.strictEqual(doc.isDirty, true)
      assert.strictEqual(fs.readFileSync(file, 'utf8'), saved, 'fix did not save')
      await vscode.commands.executeCommand('undo')
      assert.ok(doc.getText().includes('example;  '), 'fix is undoable')
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  test('format command targets the clicked split editor', async function () {
    this.timeout(30000)
    const root = vscode.workspace.workspaceFolders![0].uri.fsPath
    const fileA = path.join(root, 'format-split-a.sas')
    const fileB = path.join(root, 'format-split-b.sas')
    fs.writeFileSync(fileA, 'data a;  \nrun;\n')
    fs.writeFileSync(fileB, 'data b;  \nrun;\n')
    try {
      const a = await vscode.workspace.openTextDocument(fileA)
      const b = await vscode.workspace.openTextDocument(fileB)
      await vscode.window.showTextDocument(a, vscode.ViewColumn.One)
      await vscode.window.showTextDocument(b, vscode.ViewColumn.Two)
      const aBefore = a.getText()
      const bBefore = b.getText()
      await vscode.commands.executeCommand('sasjs-for-vscode.formatDocument', a.uri)
      assert.notStrictEqual(a.getText(), aBefore, 'clicked document was formatted')
      assert.strictEqual(b.getText(), bBefore, 'other document was untouched')
      assert.strictEqual(fs.readFileSync(fileA, 'utf8'), aBefore, 'format did not save')
    } finally {
      fs.rmSync(fileA, { force: true })
      fs.rmSync(fileB, { force: true })
    }
  })
})
