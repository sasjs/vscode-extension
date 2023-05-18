module.exports = {
  preset: 'ts-jest/presets/js-with-ts',
  resetMocks: true,
  restoreMocks: true,
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts?$': 'ts-jest'
  },
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: -10
    }
  },
  collectCoverageFrom: ['src/**/{!(index),}.ts'],
  testMatch: ['**/*spec.[j|t]s?(x)']
}
