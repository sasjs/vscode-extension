const assert = require('node:assert/strict')
const { test } = require('node:test')
const { checkCoverage } = require('./check-coverage.cjs')

const source = '/workspace/src/languageServer/languageServer.ts'
const editorTest = '/workspace/src/test/suite/languageServer.test.ts'

test('coverage contains production code and excludes editor-host tests', () => {
  assert.deepEqual(checkCoverage({ total: {}, [source]: {} }), [])
  assert.match(checkCoverage({ total: {}, [source]: {}, [editorTest]: {} }).join('\n'), /editor-host/)
  assert.match(checkCoverage({ total: {}, [editorTest]: {} }).join('\n'), /production/)
  assert.match(checkCoverage({ total: {} }).join('\n'), /production/)
  assert.deepEqual(checkCoverage({ total: {}, [source.replaceAll('/', '\\')]: {} }), [])
})
