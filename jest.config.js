module.exports = {
  preset: 'ts-jest/presets/js-with-ts',
  resetMocks: true,
  restoreMocks: true,
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts?$': [
      'ts-jest',
      // The sources are CommonJS, and @sasjs/sas-language is imported from
      // them with a dynamic import. `module: commonjs` is what makes that
      // import resolvable under jest, which loads through `require`.
      { tsconfig: { module: 'commonjs' } }
    ],
    'node_modules/@sasjs/sas-language/dist/.*\\.js$': [
      'ts-jest',
      { tsconfig: { module: 'commonjs', allowJs: true } }
    ]
  },
  // @sasjs/sas-language publishes ES modules, so its files are the one thing in
  // node_modules that has to be transformed before jest can load them.
  transformIgnorePatterns: ['/node_modules/(?!@sasjs/sas-language/dist/)'],
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
