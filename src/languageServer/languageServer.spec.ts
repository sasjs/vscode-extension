/**
 * Asserts the language server wiring: where the server bundle is run from,
 * the shape of the options the client starts it with, and that start/stop
 * cycle the client cleanly. The vscode module is jest-mocked, and the
 * language client is stubbed at module registry level, so the wiring runs
 * without VS Code.
 */
import * as assert from 'assert'

const startedClients: Array<{
  id: string
  name: string
  serverOptions: unknown
  clientOptions: unknown
}> = []
const stopCalls: string[] = []

jest.mock('vscode', () => ({
  ExtensionContext: class {},
  workspace: {},
  window: {},
  commands: {},
  languages: {},
  StatusBarAlignment: {},
  Uri: {}
}))

jest.mock('vscode-languageclient/node', () => ({
  LanguageClient: class {
    constructor(
      id: string,
      name: string,
      serverOptions: unknown,
      clientOptions: unknown
    ) {
      startedClients.push({ id, name, serverOptions, clientOptions })
    }

    start(): Promise<void> {
      return Promise.resolve()
    }

    async stop(): Promise<void> {
      stopCalls.push('stop')
    }

    error(): void {}
  },
  TransportKind: { ipc: 'ipc', stdio: 'stdio' },
  LanguageClientOptions: {},
  ServerOptions: {}
}))

describe('the SAS language server wiring', () => {
  const context = {
    asAbsolutePath: (p: string) => `/installed/extension/${p}`,
    subscriptions: []
  } as never

  let startSasLanguageServer: typeof import('./languageServer').startSasLanguageServer
  let stopSasLanguageServer: typeof import('./languageServer').stopSasLanguageServer
  let isSasLanguageServerRunning: typeof import('./languageServer').isSasLanguageServerRunning
  let serverOptions: typeof import('./languageServer').serverOptions

  beforeAll(() => {
    ;({
      startSasLanguageServer,
      stopSasLanguageServer,
      isSasLanguageServerRunning
    } = require('./languageServer'))
    serverOptions = require('./languageServer').serverOptions
  })

  beforeEach(async () => {
    // The module keeps one client; stopping it here makes every test start
    // from a known state, whatever the previous test left behind. The arrays
    // clear after the stop, so its calls never count against the next test.
    await stopSasLanguageServer()
    startedClients.length = 0
    stopCalls.length = 0
  })

  it('runs the server from the staged node tree, at the depth the package ships', () => {
    const options = serverOptions(context) as unknown as {
      run: { module: string; transport: string }
    }

    assert.strictEqual(
      options.run.module,
      '/installed/extension/out/server/dist/node/server.js'
    )
    assert.strictEqual(options.run.transport, 'ipc')
  })

  it('serves sas documents only', () => {
    const { clientOptions } = require('./languageServer')

    assert.deepStrictEqual(clientOptions.documentSelector, [
      { language: 'sas' }
    ])
  })

  it('starts one client, and reports it running', async () => {
    await startSasLanguageServer(context)

    assert.strictEqual(startedClients.length, 1)
    assert.strictEqual(
      startedClients[0].id,
      'sasjs-sas-language-server'
    )
    assert.strictEqual(isSasLanguageServerRunning(), true)
  })

  it('does not start a second client while one is running', async () => {
    await startSasLanguageServer(context)
    await startSasLanguageServer(context)

    assert.strictEqual(startedClients.length, 1)
  })

  it('stops the running client, and reports it stopped', async () => {
    await startSasLanguageServer(context)
    await stopSasLanguageServer()

    assert.strictEqual(stopCalls.length, 1)
    assert.strictEqual(isSasLanguageServerRunning(), false)
  })

  it('starting after a stop creates a fresh client', async () => {
    await startSasLanguageServer(context)
    await stopSasLanguageServer()
    await startSasLanguageServer(context)

    assert.strictEqual(startedClients.length, 2)
    assert.strictEqual(isSasLanguageServerRunning(), true)
  })
})
