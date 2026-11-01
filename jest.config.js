module.exports = {
  preset: 'ts-jest/presets/js-with-ts',
  resetMocks: true,
  restoreMocks: true,
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts?$': 'ts-jest'
  },
  // json-summary is what .github/scripts/coverage-ratchet.mjs compares against
  // the published baseline in the pull request workflow; the rest are for a
  // human reading a local run.
  coverageReporters: ['clover', 'json', 'json-summary', 'lcov', 'text'],
  // INFO: uncomment coverageThreshold when required coverage is achieved
  // coverageThreshold: {
  //   global: {
  //     branches: 80,
  //     functions: 80,
  //     lines: 80,
  //     statements: -10
  //   }
  // },
  collectCoverageFrom: ['src/**/{!(index),}.ts'],
  testMatch: ['**/*spec.[j|t]s?(x)']
}
