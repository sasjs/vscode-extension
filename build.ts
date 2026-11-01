import * as fs from 'fs'
import * as path from 'path'
import { build } from 'esbuild'
import {
  copyTree,
  serverEntrySegments,
  serverTreeSource,
  serverTreeTarget,
  stageServerTree
} from './src/languageServer/serverTree'

/**
 * Stages the files the packaged extension needs next to out/extension.js:
 * the doxygen layout, and the SAS language server's node tree, which the
 * bundle reads parts of itself from disk at runtime (impl/, typeshed/, the
 * help tree), so it ships with its layout intact - the entry point lands at
 * out/server/dist/node/server.js and every relative path it computes still
 * resolves. Licence notices travel with it (see server/provenance.json).
 */
const stageAssets = (): void => {
  copyTree('./src/doxy', './out/doxy')

  stageServerTree(serverTreeSource, serverTreeTarget)

  for (const file of [
    'LICENSE.txt',
    'LICENSE.typeshed.txt',
    'LICENSE.pyright.txt',
    'LICENSE.server.js.txt',
    'provenance.json'
  ]) {
    const source = path.join('./node_modules/@sasjs/sas-language/server', file)
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join('./out/server', file))
    }
  }

  // A packaged extension that cannot find the server crashes the language
  // client on every activation, so fail the build rather than ship one. The
  // path is the same definition serverModulePath reads, and the data has to
  // be two levels above it for the bundle's own requires to resolve.
  const entryPoint = path.join(serverTreeTarget, ...serverEntrySegments)
  if (!fs.existsSync(entryPoint)) {
    throw new Error(
      `SAS language server entry point missing from the staged tree: ${entryPoint}`
    )
  }
}

;(async () => {
  const sourcemap = process.argv.includes('--sourcemap')
  const minify = process.argv.includes('--minify')
  const watch = process.argv.includes('--watch')

  const res = await build({
    entryPoints: ['./src/extension.ts'],
    outfile: 'out/extension.js',
    external: [
      'vscode',
      '@sasjs/utils/fs',
      'node-graphviz',
      '@sasjs/cli',
      '@sasjs/adapter',
      // The language client and its protocol carry node-vscode entry points
      // that must stay unbundled; they ship in node_modules alongside the
      // extension, and VS Code's extension host resolves them from there.
      'vscode-languageclient',
      'vscode-languageserver-protocol',
      'vscode-languageserver-types',
      'vscode-jsonrpc',
      'vscode-jsonrpc/*',
      'vscode-languageclient/*'
    ],
    format: 'cjs',
    platform: 'node',
    bundle: true,
    sourcemap: sourcemap,
    minify: minify,
    plugins: []
  })

  stageAssets()
})()
