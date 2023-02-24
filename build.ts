import { copy } from 'esbuild-plugin-copy'
import { build } from 'esbuild'
;(async () => {
  const sourcemap = process.argv.includes('--sourcemap')
  const minify = process.argv.includes('--minify')
  const watch = process.argv.includes('--watch')

  const res = await build({
    entryPoints: ['./src/extension.ts'],
    outfile: 'out/extension.js',
    external: ['vscode', '@sasjs/utils/fs', 'node-graphviz', '@sasjs/cli'],
    format: 'cjs',
    platform: 'node',
    bundle: true,
    sourcemap: sourcemap,
    minify: minify,
    watch: watch,
    plugins: [
      copy({
        resolveFrom: 'cwd',
        assets: [
          {
            from: ['./src/doxy/**/*'],
            to: ['./out/doxy']
          }
        ]
      })
    ]
  })
})()
