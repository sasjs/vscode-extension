import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

/**
 * Verifies the SAS language server inside a running VS Code: the extension
 * starts it at activation, and each LSP feature answers through the real
 * editor - the same surface a user touches.
 */
suite('SAS Language Server', () => {
  const workspaceFile = 'language-server.sas'

  suiteSetup(async function () {
    // The server download and initialize can take a while on a cold cache.
    this.timeout(60000)

    const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath
    assert.ok(workspacePath, 'the test workspace is open')

    // A program with a real call site, so signature help and hover have
    // something to answer, and a data step plus proc for symbols.
    fs.writeFileSync(
      path.join(workspacePath, workspaceFile),
      [
        '/* language server integration test */',
        'data work.example;',
        '  set sashelp.class;',
        '  bmi = weight / (height * height);',
        '  total = sum(weight, height);',
        'run;',
        '',
        'proc means data=work.example;',
        '  var bmi;',
        'run;'
      ].join('\n')
    )

    const document = await vscode.workspace.openTextDocument(
      path.join(workspacePath, workspaceFile)
    )
    await vscode.window.showTextDocument(document)

    // Wait until the server actually answers a feature request instead of a
    // fixed sleep: the server's first start indexes its help tree, which is
    // slow on a cold cache and quick when the OS page cache is warm.
    const deadline = Date.now() + 60000
    for (;;) {
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        document.uri,
        new vscode.Position(1, 2)
      )
      if (hovers?.length || Date.now() > deadline) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  })

  suiteTeardown(() => {
    const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath
    if (workspacePath) {
      fs.rmSync(path.join(workspacePath, workspaceFile), { force: true })
    }
  })

  test('the extension is active', async () => {
    const extension = vscode.extensions.getExtension('SASjs.sasjs-for-vscode')
    assert.ok(extension, 'the extension is installed')
    assert.strictEqual(extension.isActive, true)
  })

  test('hover answers with the SAS help', async () => {
    const document = await vscode.workspace.openTextDocument(
      path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, workspaceFile)
    )
    const position = new vscode.Position(1, 2) // on `data`

    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      document.uri,
      position
    )

    assert.ok(hovers?.length, 'hover returns at least one result')
    const text = hovers
      .map((hover) =>
        hover.contents
          .map((content) =>
            typeof content === 'string' ? content : content.value
          )
          .join('\n')
      )
      .join('\n')
    assert.ok(
      text.toLowerCase().includes('data'),
      'the hover names the statement'
    )
  })

  test('completions offer SAS keywords', async () => {
    const document = await vscode.workspace.openTextDocument(
      path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, workspaceFile)
    )
    const position = new vscode.Position(6, 3) // on `proc` line start area

    const list = await vscode.commands.executeCommand<
      vscode.CompletionList | vscode.CompletionItem[]
    >('vscode.executeCompletionItemProvider', document.uri, position)

    const items = Array.isArray(list) ? list : list?.items ?? []
    assert.ok(items.length > 5, `completions answer (got ${items.length})`)
  })

  test('function snippets insert argument placeholders', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'sas',
      content: 'data test;\n  x = ata\nrun;'
    })
    const editor = await vscode.window.showTextDocument(document)
    const position = new vscode.Position(1, 9)
    const list = await vscode.commands.executeCommand<vscode.CompletionList | vscode.CompletionItem[]>(
      'vscode.executeCompletionItemProvider', document.uri, position
    )
    const items = Array.isArray(list) ? list : list?.items ?? []
    const snippet = items.find((item) => {
      const label = typeof item.label === 'string' ? item.label : item.label.label
      return label.toLowerCase() === 'atan2' && item.kind === vscode.CompletionItemKind.Snippet
    })
    assert.ok(snippet, 'atan2 function snippet is available')
    assert.ok(snippet.insertText instanceof vscode.SnippetString)
    assert.strictEqual(snippet.insertText.value, 'atan2(${1:x}, ${2:y})')
    const range = new vscode.Range(new vscode.Position(1, 6), position)
    assert.strictEqual(await editor.insertSnippet(snippet.insertText, range), true)
    assert.strictEqual(document.lineAt(1).text, '  x = atan2(x, y)')
    await vscode.commands.executeCommand('type', { text: 'height' })
    await vscode.commands.executeCommand('jumpToNextSnippetPlaceholder')
    await vscode.commands.executeCommand('type', { text: 'weight' })
    assert.strictEqual(document.lineAt(1).text, '  x = atan2(height, weight)')
  })

  test('compound snippet has four navigable arguments', async () => {
    const document = await vscode.workspace.openTextDocument({ language: 'sas', content: 'compou' })
    const editor = await vscode.window.showTextDocument(document)
    const position = new vscode.Position(0, 6)
    const list = await vscode.commands.executeCommand<vscode.CompletionList | vscode.CompletionItem[]>(
      'vscode.executeCompletionItemProvider', document.uri, position
    )
    const items = Array.isArray(list) ? list : list?.items ?? []
    const snippet = items.find((item) => {
      const label = typeof item.label === 'string' ? item.label : item.label.label
      return label.toLowerCase() === 'compound' && item.kind === vscode.CompletionItemKind.Snippet
    })
    assert.ok(snippet?.insertText instanceof vscode.SnippetString, 'compound snippet is available')
    assert.strictEqual(await editor.insertSnippet(snippet.insertText, new vscode.Range(new vscode.Position(0, 0), position)), true)
    for (const [index, value] of ['100', '200', '0.05', '10'].entries()) {
      if (index > 0) {
        await vscode.commands.executeCommand('jumpToNextSnippetPlaceholder')
      }
      await vscode.commands.executeCommand('type', { text: value })
    }
    assert.strictEqual(document.lineAt(0).text, 'compound(100, 200, 0.05, 10)')
  })

  test('document symbols outline the program', async () => {
    const document = await vscode.workspace.openTextDocument(
      path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, workspaceFile)
    )

    const symbols = await vscode.commands.executeCommand<
      vscode.DocumentSymbol[]
    >('vscode.executeDocumentSymbolProvider', document.uri)

    assert.ok(symbols?.length, 'symbols answer')
  })
})
