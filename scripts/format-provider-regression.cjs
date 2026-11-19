// Exercise the registered extension provider with the real linter and its default
// dynamic engine loader. Only the VS Code host is replaced; Jest cannot load the
// engine's ES module in-process, so the spec runs this in a separate Node process.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const project = fs.mkdtempSync(path.join(os.tmpdir(), 'sas-format-provider-'))
process.projectDir = project
fs.writeFileSync(path.join(project, '.sasjslint'), JSON.stringify({ hasDoxygenHeader: false }))

let provider
const vscode = {
  Range: class Range { constructor(...args) { this.args = args } },
  TextEdit: { replace: (range, newText) => ({ range, newText }) },
  languages: { registerDocumentFormattingEditProvider: (language, value) => {
    assert.equal(language, 'sas')
    provider = value
  } },
  Uri: { file: (file) => file },
  workspace: {
    fs: { readFile: (file) => fs.promises.readFile(file) },
    getConfiguration: () => ({ get: () => ({}) })
  },
  window: { showErrorMessage: (message) => { throw new Error(message) } }
}
const load = Module._load
Module._load = function (name, ...args) {
  return name === 'vscode' ? vscode : load.call(this, name, ...args)
}

const input = [
  '%macro f();',
  '%if &type=N %then %do;',
  '&valn',
  '%end;',
  '%else %if &type=C %then %do;',
  '&valc',
  '%end;',
  '%mend f;',
  ''
].join('\n')
const expected = [
  '%macro f();',
  '  %if &type=N %then %do;',
  '    &valn',
  '  %end;',
  '  %else %if &type=C %then %do;',
  '    &valc',
  '  %end;',
  '%mend f;',
  ''
].join('\n')

async function format(text) {
  const edits = await provider.provideDocumentFormattingEdits({
    lineCount: text.split('\n').length,
    getText: () => text
  })
  assert.equal(edits.length, 1)
  return edits[0].newText
}

;(async () => {
  try {
    const { FormatCommand } = require('../src/commands/format/FormatCommand')
    await new FormatCommand().initialise()
    const result = await format(input)
    assert.equal(result, expected)
    assert.equal(await format(result), result)
  } finally {
    fs.rmSync(project, { recursive: true, force: true })
  }
})().catch((error) => { console.error(error); process.exitCode = 1 })
