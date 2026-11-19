import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { LintConfig, lintFile } from '@sasjs/lint'
import { lint } from './lint'
import { getLintConfig } from '../utils/getLintConfig'

jest.mock('vscode', () => ({
  Position: class { constructor(public line: number, public character: number) {} },
  Range: class { constructor(public start: unknown, public end: unknown) {} },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
  workspace: { workspaceFolders: undefined },
  window: { showErrorMessage: jest.fn() },
  languages: { createDiagnosticCollection: jest.fn() }
}))
jest.mock('../utils/getLintConfig', () => ({ getLintConfig: jest.fn() }))

it('reports a real lint finding in unsaved text without writing the saved file', async () => {
  const originalCwd = process.cwd()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-live-lint-'))
  const filePath = path.join(root, 'program.sas')
  const saved = 'data example;\nrun;\n'
  const live = 'data example;  \nrun;\n'
  fs.writeFileSync(path.join(root, '.sasjslint'), '{}')
  fs.writeFileSync(filePath, saved)
  const set = jest.fn()
  const clear = jest.fn()
  ;(vscode.languages.createDiagnosticCollection as jest.Mock).mockReturnValue({
    set,
    clear
  })
  const config = new LintConfig({})
  ;(getLintConfig as jest.Mock).mockResolvedValue(config)
  ;(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: root } }]

  try {
    const savedDiagnostics = await lintFile(filePath, config)
    expect(savedDiagnostics.map((item) => item.message)).not.toContain('Line contains trailing spaces')
    await lint({
      document: {
        uri: { scheme: 'file', fsPath: filePath },
        version: 1,
        getText: () => live
      }
    } as unknown as vscode.TextEditor)
    const messages = set.mock.calls[0][1].map((item: vscode.Diagnostic) => item.message)
    expect(messages).toContain('Line contains trailing spaces')
    expect(fs.readFileSync(filePath, 'utf8')).toBe(saved)

    // A malformed inline rule value must be reported, not become an unhandled
    // rejection that leaves the previous buffer's diagnostics in place.
    await lint({
      document: {
        uri: { scheme: 'file', fsPath: filePath },
        version: 2,
        getText: () => '/**\n * @sasjslint {"keywordCase":"bogus"}\n */\ndata example; run;'
      }
    } as unknown as vscode.TextEditor)
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('keywordCase')
    )
    expect(set).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalledTimes(1)
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
})
