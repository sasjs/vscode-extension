// Smoke test for the three majors, without VS Code.
//
// The integration suite (`npm test`) needs to download VS Code, which this box
// cannot reach, so this exercises the exact entry points the extension calls
// instead, at the versions the bump installs. Run from the repo root:
//
//   node scripts/smoke-majors.mjs
//
// It is a probe, not a test: it does not assert behaviour, it proves the API
// shapes the source depends on still exist and answer.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const fail = (what, detail) => {
  console.error(`FAIL ${what}: ${detail}`)
  process.exitCode = 1
}
const ok = (what, detail = '') => console.log(`ok   ${what}${detail ? ': ' + detail : ''}`)

// --- @sasjs/adapter 6.1.1, the same import the extension uses (src/utils/getSASjs.ts)
// require, not import: the extension resolves '@sasjs/adapter/node' through CJS,
// and ESM refuses a directory specifier that CJS resolves happily.
const SASjs = require('@sasjs/adapter/node').default
if (typeof SASjs !== 'function') fail('adapter SASjs default export', typeof SASjs)
else {
  const sasjs = new SASjs({
    serverUrl: 'https://example.com',
    serverType: 'SASVIYA',
    appLoc: '/Public/app',
    contextName: 'SAS Job Execution compute context',
    httpsAgentOptions: {},
    useComputeApi: true,
    debug: false
  })
  const cfg = sasjs.getSasjsConfig()
  ok('adapter SASjs constructs', `pathSASJS=${JSON.stringify(cfg.pathSASJS)}`)
  ok('adapter config survives', `appLoc=${cfg.appLoc} contextName=${cfg.contextName}`)
}

// --- @sasjs/lint 5.4.0: lintFile, formatText, DefaultLintConfiguration
const lint = require('@sasjs/lint')
for (const name of ['lintFile', 'formatText', 'DefaultLintConfiguration']) {
  if (!(name in lint)) fail('lint export', name)
}
if ('Severity' in lint) ok('lint exports Severity')
// lintFile takes a path, which is what src/lint/lint.ts passes it: the editor's
// document uri, as a filesystem path.
const sample = join(tmpdir(), 'smoke-majors.sas')
writeFileSync(sample, 'data WORK.FOO;\n  set sashelp.class; trailing \nrun;    \n')
// The extension wraps the defaults in LintConfig before handing them over
// (src/utils/getLintConfig.ts), so the probe does the same.
const lintConfig = new lint.LintConfig(lint.DefaultLintConfiguration)
const diagnostics = await lint.lintFile(sample, lintConfig)
if (!Array.isArray(diagnostics) || diagnostics.length === 0) fail('lintFile diagnostics', JSON.stringify(diagnostics))
else ok('lintFile returns diagnostics', `${diagnostics.length} on trailing whitespace`)
// formatText is async and takes the config, as src/commands/format/FormatCommand.ts does
const formatted = await lint.formatText(readFileSync(sample, 'utf8'), lintConfig)
if (typeof formatted !== 'string' || formatted.length === 0)
  fail('formatText', `${typeof formatted} ${JSON.stringify(formatted).slice(0, 80)}`)
else ok('formatText returns text', `${formatted.length} chars`)

// --- @sasjs/sas-language 0.4.0 ships the server as files, staged by build.ts
const required = [
  'out/server/dist/node/server.js',
  'out/server/data/WHERE.json',
  'out/server/pubsdata/procedures.json'
]
const missing = required.filter((p) => !existsSync(p))
if (missing.length) fail('language server tree not staged', missing.join(', '))
else ok('language server staged', required.length + ' required files present')

console.log(process.exitCode ? '\nsmoke: FAILED' : '\nsmoke: all surfaces answered')
