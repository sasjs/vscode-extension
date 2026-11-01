/**
 * Asserts the staged SAS language server against the client that runs it: the
 * entry point has to exist at the path serverModulePath computes, its
 * requires have to resolve from there, and the bundle has to serve a hover
 * from the staged help data.
 *
 * Staging here rather than reading out/ keeps the check independent of a
 * build: the spec fails on the layout the build would produce, which is what
 * went wrong in 2.12.0 (the tree was one level too deep, every activation
 * logged MODULE_NOT_FOUND and the client gave up after five crashes).
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'
import {
  serverEntrySegments,
  serverTreeSource,
  serverTreeTarget,
  stageServerTree
} from './serverTree'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-language-server-'))
// Literal, not derived from the constants under test: this is the layout the
// client and the published extension agree on, and asserting it here is what
// stops a changed constant from being self-consistent and still wrong.
const staged = path.join(root, 'out', 'server')
const entryPoint = path.join(staged, 'dist', 'node', 'server.js')

beforeAll(() => {
  stageServerTree(serverTreeSource, staged)
}, 120000)

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const frame = (message: unknown): Buffer => {
  const body = Buffer.from(JSON.stringify(message))
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'),
    body
  ])
}

/**
 * Runs the staged server over stdio and returns the markdown of a hover on
 * `proc sql`. A language server that starts is not proof it works: the bundle
 * only touches its data when a feature asks for it, so the request has to
 * reach the help tree to tell a staged tree from a broken one.
 */
const hoverOnProcSql = (entry: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const uri = 'file:///tmp/sasjs-server-tree-test.sas'
    let buffer = Buffer.alloc(0)
    let stderr = ''
    let settled = false

    const finish = (error: Error | null, value?: string): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      child.kill()
      if (error) {
        reject(error)
      } else {
        resolve(value as string)
      }
    }

    const timer = setTimeout(
      () => finish(new Error('the language server did not answer in time')),
      60000
    )

    const take = (): Record<string, any> | undefined => {
      const separator = buffer.indexOf('\r\n\r\n')
      if (separator < 0) {
        return undefined
      }
      const header = buffer.subarray(0, separator).toString('ascii')
      const length = Number(/Content-Length: (\d+)/i.exec(header)?.[1])
      if (!Number.isFinite(length) || buffer.length < separator + 4 + length) {
        return undefined
      }
      const body = buffer
        .subarray(separator + 4, separator + 4 + length)
        .toString('utf8')
      buffer = buffer.subarray(separator + 4 + length)
      return JSON.parse(body)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      let message = take()
      while (message) {
        if (message.id === 1) {
          child.stdin.write(
            frame({ jsonrpc: '2.0', method: 'initialized', params: {} })
          )
          child.stdin.write(
            frame({
              jsonrpc: '2.0',
              method: 'textDocument/didOpen',
              params: {
                textDocument: {
                  uri,
                  languageId: 'sas',
                  version: 1,
                  text: 'proc sql;\n  select 1;\nquit;\n'
                }
              }
            })
          )
          child.stdin.write(
            frame({
              jsonrpc: '2.0',
              id: 2,
              method: 'textDocument/hover',
              params: {
                textDocument: { uri },
                position: { line: 0, character: 6 }
              }
            })
          )
        }
        if (message.id === 2) {
          const value = message.result?.contents?.value
          if (typeof value !== 'string') {
            return finish(
              new Error(
                `the server answered hover without contents: ${JSON.stringify(
                  message
                ).slice(0, 400)}`
              )
            )
          }
          return finish(null, value)
        }
        message = take()
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', finish)

    child.on('exit', (code) =>
      finish(
        new Error(
          `the language server exited (${code}) before answering: ${stderr.slice(
            0,
            800
          )}`
        )
      )
    )

    child.stdin.write(
      frame({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { processId: process.pid, rootUri: null, capabilities: {} }
      })
    )
  })

describe('the staged SAS language server', () => {
  it('lands its entry point where the client looks for it', () => {
    // The constants the build stages with have to describe the layout the
    // client asks for; languageServer.spec.ts asserts that layout literally on
    // the client side, so a changed constant fails there and here together.
    expect(serverTreeTarget).toBe(path.join('out', 'server'))
    expect(path.join(...serverEntrySegments)).toBe(
      path.join('dist', 'node', 'server.js')
    )

    expect(fs.existsSync(entryPoint)).toBe(true)
  })

  it('keeps the requires beside the entry point and the help data two levels above', () => {
    for (const sibling of ['impl', 'package.json', 'typeshed-fallback']) {
      expect(fs.existsSync(path.join(path.dirname(entryPoint), sibling))).toBe(
        true
      )
    }

    for (const helpFile of [
      path.join('data', 'WHERE.json'),
      path.join('pubsdata', 'procedures.json'),
      'messagebundle.properties'
    ]) {
      expect(fs.existsSync(path.join(staged, helpFile))).toBe(true)
    }
  })

  it('answers a hover from its staged data', async () => {
    const hover = await hoverOnProcSql(entryPoint)

    expect(hover).toContain('PROC SQL')
    expect(hover).toContain('documentation.sas.com')
  }, 120000)
})
