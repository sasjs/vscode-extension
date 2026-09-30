import * as path from 'path'
import * as vscode from 'vscode'
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node'

/**
 * The SAS language server, run from the node build that @sasjs/sas-language
 * ships. The server is a self-contained bundle staged into out/server at
 * build time, so the extension runs it as a module over IPC and bundles
 * nothing of it into out/extension.js.
 *
 * The client owns no feature wiring of its own: the server declares its
 * capabilities at initialize and the client registers handlers for them,
 * which is the whole point of adopting it.
 */

let client: LanguageClient | undefined

/**
 * Where the staged server tree lives at runtime. `asAbsolutePath` resolves
 * inside the installed extension; the entry point sits at the depth the
 * sas-language package ships, because the bundle resolves its runtime files
 * relative to itself.
 */
export const serverModulePath = (context: vscode.ExtensionContext): string =>
  context.asAbsolutePath(
    path.join('out', 'server', 'dist', 'node', 'server.js')
  )

/** The server options, split out so tests can assert their shape. */
export const serverOptions = (context: vscode.ExtensionContext): ServerOptions => {
  const module = serverModulePath(context)

  return {
    run: { module, transport: TransportKind.ipc },
    debug: { module, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6009'] } }
  }
}

/** The document selector: the server serves SAS documents. */
export const clientOptions: LanguageClientOptions = {
  documentSelector: [{ language: 'sas' }]
}

/**
 * Starts the SAS language server. A failure to start is logged and leaves
 * the rest of the extension working: the language server adds hover,
 * completions and symbols, and the extension's own commands do not depend
 * on it.
 */
export const startSasLanguageServer = async (
  context: vscode.ExtensionContext
): Promise<void> => {
  if (client) {
    return
  }

  const languageClient = new LanguageClient(
    'sasjs-sas-language-server',
    'SAS Language Server',
    serverOptions(context),
    clientOptions
  )

  try {
    await languageClient.start()
    client = languageClient
    context.subscriptions.push({ dispose: () => (client = undefined) })
  } catch (error) {
    languageClient.error(`starting the SAS language server failed: ${String(error)}`)
  }
}

/** Stops the server, if it is running. Called on extension deactivation. */
export const stopSasLanguageServer = async (): Promise<void> => {
  if (!client) {
    return
  }

  await client.stop()
  client = undefined
}

/** Whether the server is running, for tests and status reporting. */
export const isSasLanguageServerRunning = (): boolean => Boolean(client)
