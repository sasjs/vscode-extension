import * as path from 'path'
import * as vscode from 'vscode'
import { build, compile, compileSingleFile, deploy } from '@sasjs/cli/build/commands'
import { isTestFile } from '@sasjs/utils'
import { getLocalConfiguration } from '../../utils/config'
import { handleErrorResponse } from '../../utils/utils'
import { CompileBuildDeployCommand } from './compileBuildDeployCommand'

jest.mock('vscode', () => ({
  commands: { registerCommand: jest.fn() },
  window: { activeTextEditor: undefined, showErrorMessage: jest.fn(), showInformationMessage: jest.fn() },
  workspace: { workspaceFolders: undefined }
}))
jest.mock('@sasjs/cli/build/commands', () => ({
  compile: jest.fn(), compileSingleFile: jest.fn(), build: jest.fn(), deploy: jest.fn()
}))
jest.mock('@sasjs/utils', () => ({ isTestFile: jest.fn() }))
jest.mock('../../utils/config', () => ({ getLocalConfiguration: jest.fn() }))
jest.mock('../../utils/utils', () => ({ handleErrorResponse: jest.fn() }))
// Target selection is not part of this command's orchestration contract.
jest.mock('../../types/commands/targetCommand', () => ({
  // Match the class export used by the real command.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  TargetCommand: class { getTargetInfo = jest.fn() }
}))

const register = vscode.commands.registerCommand as jest.Mock
const compileProject = compile as jest.Mock
const compileFile = compileSingleFile as jest.Mock
const buildProject = build as jest.Mock
const deployProject = deploy as jest.Mock
const getConfig = getLocalConfiguration as jest.Mock
const isTest = isTestFile as jest.Mock
const showError = vscode.window.showErrorMessage as jest.Mock
const showSuccess = vscode.window.showInformationMessage as jest.Mock
const reportError = handleErrorResponse as jest.Mock
const target = { name: 'dev', serviceConfig: { serviceFolders: ['services'] }, jobConfig: { jobFolders: ['jobs'] } }
const successMessage = 'Compile, build and deploy has been successful!'
let originalConstants: typeof process.sasjsConstants

beforeAll(() => { originalConstants = process.sasjsConstants })
afterAll(() => { process.sasjsConstants = originalConstants })

beforeEach(() => {
  ;(vscode.workspace as any).workspaceFolders = [{ uri: { path: '/workspace/project' } }]
  ;(vscode.window as any).activeTextEditor = { document: { fileName: '/workspace/project/sasjsconfig.json' } }
  process.sasjsConstants = { buildDestinationFolder: '/workspace/project/sasjsbuild' } as any
  compileProject.mockResolvedValue(undefined)
  compileFile.mockResolvedValue({ destinationPath: 'compiled.sas' })
  buildProject.mockResolvedValue(undefined)
  deployProject.mockResolvedValue(undefined)
  getConfig.mockResolvedValue({})
  isTest.mockReturnValue(false)
})

async function setup(selectedTarget: any = target, isLocal = true) {
  const disposable = { dispose: jest.fn() }
  register.mockReturnValue(disposable)
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext
  const command = new CompileBuildDeployCommand(context)
  ;(command as any).getTargetInfo.mockResolvedValue({ target: selectedTarget, isLocal })
  await command.initialise()
  expect(register).toHaveBeenCalledTimes(1)
  expect(register).toHaveBeenCalledWith('sasjs-for-vscode.compileBuildDeploy', expect.any(Function))
  expect(context.subscriptions).toEqual([disposable])
  return register.mock.calls[0][1] as () => Promise<void>
}

function open(fileName: string) {
  ;(vscode.window as any).activeTextEditor = { document: { fileName } }
}

function expectNoSuccess() {
  expect(showSuccess).not.toHaveBeenCalled()
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

test('installed CLI exposes the command entry points used by the extension', () => {
  const actual = jest.requireActual('@sasjs/cli/build/commands')
  for (const name of ['compile', 'compileSingleFile', 'build', 'deploy']) {
    expect(actual[name]).toEqual(expect.any(Function))
  }
})

test('registered project command awaits compile then build then deploy and reports success', async () => {
  const compilation = deferred()
  const building = deferred()
  const deployment = deferred()
  compileProject.mockReturnValue(compilation.promise)
  buildProject.mockReturnValue(building.promise)
  deployProject.mockReturnValue(deployment.promise)
  const run = await setup(target, false)
  const running = run()
  await Promise.resolve()
  expect(compileProject).toHaveBeenCalledTimes(1)
  expect(compileProject).toHaveBeenCalledWith(target, true)
  expect(compileFile).not.toHaveBeenCalled()
  expect(buildProject).not.toHaveBeenCalled()
  compilation.resolve()
  await new Promise<void>((resolve) => setImmediate(resolve))
  expect(buildProject).toHaveBeenCalledTimes(1)
  expect(buildProject).toHaveBeenCalledWith(target)
  expect(deployProject).not.toHaveBeenCalled()
  building.resolve()
  await new Promise<void>((resolve) => setImmediate(resolve))
  expect(deployProject).toHaveBeenCalledTimes(1)
  expect(deployProject).toHaveBeenCalledWith(target, false)
  expectNoSuccess()
  deployment.resolve()
  await running
  expect(showSuccess).toHaveBeenCalledTimes(1)
  expect(showSuccess).toHaveBeenCalledWith(successMessage)
  expect(showError).not.toHaveBeenCalled()
})

test.each([
  ['service', '/workspace/project/services/api.sas', false],
  ['job', '/workspace/project/jobs/nightly.sas', false],
  ['test', '/workspace/project/other/example.test.sas', true]
])('compiles a single %s file before building and deploying', async (type, file, isTestFile) => {
  open(file)
  isTest.mockReturnValue(isTestFile)
  const run = await setup()
  await run()
  expect(compileProject).not.toHaveBeenCalled()
  expect(compileFile).toHaveBeenCalledTimes(1)
  expect(compileFile).toHaveBeenCalledWith(target, type, file, path.join('/workspace/project/sasjsbuild', `${type}s`, 'dev'), undefined, '/workspace/project')
  expect(buildProject).toHaveBeenCalledTimes(1)
  expect(buildProject).toHaveBeenCalledWith(target)
  expect(deployProject).toHaveBeenCalledTimes(1)
  expect(deployProject).toHaveBeenCalledWith(target, true)
  expect(compileFile.mock.invocationCallOrder[0]).toBeLessThan(buildProject.mock.invocationCallOrder[0])
  expect(buildProject.mock.invocationCallOrder[0]).toBeLessThan(deployProject.mock.invocationCallOrder[0])
  expect(showSuccess).toHaveBeenCalledWith(successMessage)
  if (isTestFile) {expect(getConfig).not.toHaveBeenCalled()}
})

test.each([
  ['service', '/workspace/project/shared-services/api.sas'],
  ['job', '/workspace/project/shared-jobs/nightly.sas']
])('uses local configuration to identify a %s when target folders are undefined', async (type, file) => {
  open(file)
  const bareTarget = { name: 'dev' }
  getConfig.mockResolvedValue({ serviceConfig: { serviceFolders: ['shared-services'] }, jobConfig: { jobFolders: ['shared-jobs'] } })
  const run = await setup(bareTarget)
  await run()
  expect(compileFile).toHaveBeenCalledWith(bareTarget, type, file, path.join('/workspace/project/sasjsbuild', `${type}s`, 'dev'), undefined, '/workspace/project')
  expect(deployProject).toHaveBeenCalledWith(bareTarget, true)
})

test('unidentified files fail without compiling, building or deploying', async () => {
  open('/workspace/project/other/program.sas')
  const run = await setup()
  await run()
  expect(compileProject).not.toHaveBeenCalled()
  expect(compileFile).not.toHaveBeenCalled()
  expect(buildProject).not.toHaveBeenCalled()
  expect(deployProject).not.toHaveBeenCalled()
  expect(showError).toHaveBeenCalledWith('Compile failed!')
  expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('File type has not been identified') }), 'Compile failed!')
  expectNoSuccess()
})

test.each([
  ['project compile', 'project', 'compile', 'Compile failed!'],
  ['single file compile', 'file', 'compileSingleFile', 'Single file compile failed!'],
  ['project build', 'project', 'build', 'Build failed!'],
  ['single file build', 'file', 'build', 'Build failed!'],
  ['project deploy', 'project', 'deploy', 'Deploy failed!'],
  ['single file deploy', 'file', 'deploy', 'Deploy failed!']
])('%s failure stops subsequent steps and reports the error', async (_label, kind, stage, message) => {
  if (kind === 'file') {open('/workspace/project/services/api.sas')}
  const failure = new Error(`${stage} rejected`)
  const mocks: Record<string, jest.Mock> = { compile: compileProject, compileSingleFile: compileFile, build: buildProject, deploy: deployProject }
  mocks[stage].mockRejectedValue(failure)
  const run = await setup()
  await run()
  expect(showError).toHaveBeenCalledTimes(1)
  expect(showError).toHaveBeenCalledWith(message)
  expect(reportError).toHaveBeenCalledWith(failure, message)
  expectNoSuccess()
  if (stage === 'compile' || stage === 'compileSingleFile') {expect(buildProject).not.toHaveBeenCalled()}
  else {expect(buildProject).toHaveBeenCalledTimes(1)}
  if (stage !== 'deploy') {expect(deployProject).not.toHaveBeenCalled()}
  else {expect(deployProject).toHaveBeenCalledTimes(1)}
})

test.each(['missing target', 'missing editor'])('does nothing with %s', async (missing) => {
  if (missing === 'missing editor') {(vscode.window as any).activeTextEditor = undefined}
  const run = await setup(missing === 'missing target' ? null : target)
  await run()
  expect(compileProject).not.toHaveBeenCalled()
  expect(compileFile).not.toHaveBeenCalled()
  expect(buildProject).not.toHaveBeenCalled()
  expect(deployProject).not.toHaveBeenCalled()
  expectNoSuccess()
})
