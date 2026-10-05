import * as fs from 'fs'
import * as path from 'path'
import { build } from 'esbuild'

/**
 * Copies a file tree from one place to another, creating directories as
 * needed. Files are copied with mode preserved, so the staged server tree
 * stays executable where it was executable.
 */
const copyTree = (from: string, to: string): void => {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const target = path.join(to, entry.name)
    if (entry.isDirectory()) {
      copyTree(source, target)
    } else {
      fs.copyFileSync(source, target)
    }
  }
}

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

  copyTree(
    './node_modules/@sasjs/sas-language/server/node',
    './out/server/dist/node'
  )

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
