import { copy } from 'esbuild-plugin-copy'
import { build } from 'esbuild'
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
    plugins: [
      copy({
        resolveFrom: 'cwd',
        assets: [
          {
            from: ['./src/doxy/**/*'],
            to: ['./out/doxy']
          },
          {
            // The SAS language server's node build: a bundle that reads parts
            // of itself from disk at runtime (impl/, typeshed/, the help
            // tree), so the whole tree is copied with its layout intact -
            // the entry point lands at out/server/dist/node/server.js and
            // every relative path it computes still resolves. Licence
            // notices travel with it (see server/provenance.json).
            from: ['./node_modules/@sasjs/sas-language/server/node/**/*'],
            to: ['./out/server/']
          },
          {
            from: [
              './node_modules/@sasjs/sas-language/server/LICENSE.txt',
              './node_modules/@sasjs/sas-language/server/LICENSE.typeshed.txt',
              './node_modules/@sasjs/sas-language/server/LICENSE.pyright.txt',
              './node_modules/@sasjs/sas-language/server/LICENSE.server.js.txt',
              './node_modules/@sasjs/sas-language/server/provenance.json'
            ],
            to: ['./out/server']
          }
        ]
      })
    ]
  })
})()
