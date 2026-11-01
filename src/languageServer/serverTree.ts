import * as fs from 'fs'
import * as path from 'path'

/**
 * The SAS language server as @sasjs/sas-language ships it: a self-contained
 * node build whose entry point is at dist/node/server.js, with the modules it
 * requires (impl/) beside it and the help data (data/, pubsdata/,
 * messagebundle.properties) two levels above.
 *
 * The bundle resolves those paths against its own file rather than the
 * working directory - it requires './impl/format' directly and prefixes its
 * data reads with '../..' - so the tree only works at the depth it was built
 * for. Staging it a level too deep is not cosmetic: the client then cannot
 * find the entry point, and an entry point that is found but sits beside the
 * data instead of two levels above it dies on its first require.
 */

/** Where the package keeps the node build, entry point included. */
export const serverTreeSource = path.join(
  'node_modules',
  '@sasjs',
  'sas-language',
  'server',
  'node'
)

/**
 * The staged root. Its *contents* are copied here, not the directory itself,
 * which is what puts the entry point at out/server/dist/node/server.js.
 */
export const serverTreeTarget = path.join('out', 'server')

/** The entry point, relative to the staged root. */
export const serverEntrySegments = ['dist', 'node', 'server.js'] as const

/**
 * Copies a file tree from one place to another, creating directories as
 * needed. Files are copied with mode preserved, so the staged server tree
 * stays executable where it was executable.
 */
export const copyTree = (from: string, to: string): void => {
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

/** Stages the language server tree, layout untouched. */
export const stageServerTree = (
  from: string = serverTreeSource,
  to: string = serverTreeTarget
): void => copyTree(from, to)
