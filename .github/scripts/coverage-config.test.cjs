const assert = require('node:assert/strict')
const { test } = require('node:test')
const { globsToMatcher } = require('jest-util')
const { collectCoverageFrom } = require('../../jest.config.js')

test('Jest collects production coverage, not editor-host tests', () => {
  const matchesCoverage = globsToMatcher(collectCoverageFrom)
  assert.equal(matchesCoverage('src/test/suite/languageServer.test.ts'), false)
  assert.equal(matchesCoverage('src/languageServer/languageServer.ts'), true)
})
