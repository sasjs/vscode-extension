import * as path from 'path'
import * as vscode from 'vscode'
import {
  decodeFromBase64,
  encodeToBase64,
  ServerType,
  Target
} from '@sasjs/utils'
import * as fileModule from '../file'
import * as utilsModule from '../utils'
import * as inputModule from '../input'
import * as authModule from '../auth'
import {
  getAuthConfig,
  getAuthConfigSas9,
  getGlobalConfiguration,
  getLocalConfiguration,
  removeTargetFromGlobalRcFile,
  saveGlobalRcFile,
  saveLocalConfigFile,
  saveToConfigFile
} from '../config'

jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn(),
    showTextDocument: jest.fn()
  },
  workspace: {
    getConfiguration: jest.fn(),
    openTextDocument: jest.fn()
  }
}))

jest.mock('../file', () => ({
  readFile: jest.fn(),
  createFile: jest.fn(),
  fileExists: jest.fn()
}))

jest.mock('../utils', () => ({
  getGlobalConfigurationPath: jest.fn(),
  getLocalConfigurationPath: jest.fn(),
  isSasJsServerInServerMode: jest.fn()
}))

jest.mock('@sasjs/utils', () => ({
  ...jest.requireActual('@sasjs/utils'),
  fileExists: jest.fn()
}))

jest.mock('../input', () => ({ getChoiceInput: jest.fn() }))
jest.mock('../auth', () => ({ authenticateTarget: jest.fn() }))

const mockedReadFile = fileModule.readFile as jest.Mock
const mockedCreateFile = fileModule.createFile as jest.Mock
const mockedGlobalPath = utilsModule.getGlobalConfigurationPath as jest.Mock
const mockedLocalPath = utilsModule.getLocalConfigurationPath as jest.Mock
const mockedServerMode = utilsModule.isSasJsServerInServerMode as jest.Mock
const mockedChoiceInput = inputModule.getChoiceInput as jest.Mock
const mockedFileExists = require('@sasjs/utils').fileExists as jest.Mock
const mockedAuthenticate = authModule.authenticateTarget as jest.Mock
const mockedGetConfiguration = vscode.workspace.getConfiguration as jest.Mock
const mockedOpenTextDocument = vscode.workspace.openTextDocument as jest.Mock
const mockedShowTextDocument = vscode.window.showTextDocument as jest.Mock
const mockedShowError = vscode.window.showErrorMessage as jest.Mock

const globalPath = '/home/user/.sasjsrc'
const localPath = '/project/sasjs/sasjsconfig.json'

const extensionConfig = (
  values: Record<string, unknown> = {},
  update = jest.fn()
) => ({
  get: (key: string) => values[key],
  update
})

const targetJson = {
  name: 'server',
  serverUrl: 'https://sas.4gl.io',
  appLoc: '/Public/app',
  serverType: ServerType.Sasjs
}

beforeEach(() => {
  jest.clearAllMocks()
  process.projectDir = '/project'
  process.isSasjsProject = true
  process.sasjsConstants = {} as any
  process.outputChannel = { appendLine: jest.fn() } as any
  mockedGlobalPath.mockReturnValue(globalPath)
  mockedLocalPath.mockReturnValue(localPath)
  mockedGetConfiguration.mockReturnValue(extensionConfig())
  mockedOpenTextDocument.mockResolvedValue({})
  mockedShowTextDocument.mockResolvedValue(undefined)
  mockedCreateFile.mockResolvedValue(undefined)
  mockedFileExists.mockResolvedValue(false)
})

describe('reading the configuration', () => {
  it('returns the parsed global config', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify({ targets: [targetJson] }))

    expect(await getGlobalConfiguration()).toEqual({ targets: [targetJson] })
  })

  it('returns nothing when there is no global config file', async () => {
    mockedReadFile.mockRejectedValue(new Error('ENOENT'))

    expect(await getGlobalConfiguration()).toBeUndefined()
    expect(process.outputChannel.appendLine).toHaveBeenCalledWith(
      'A global SASjs config file was not found in your home directory.'
    )
  })

  it('opens the file and explains the error when the global config is not JSON', async () => {
    mockedReadFile.mockResolvedValue('{ not json')

    expect(await getGlobalConfiguration()).toBeUndefined()
    expect(mockedShowError).toHaveBeenCalledWith(
      expect.stringContaining('~/.sasjsrc'),
      { modal: true }
    )
    expect(mockedOpenTextDocument).toHaveBeenCalledWith(globalPath)
    expect(mockedShowTextDocument).toHaveBeenCalled()
  })

  it('returns nothing when there is no local config file', async () => {
    mockedReadFile.mockRejectedValue(new Error('ENOENT'))

    expect(await getLocalConfiguration()).toBeUndefined()
    expect(process.outputChannel.appendLine).toHaveBeenCalledWith(
      'A local SASjs config file was not found.'
    )
  })

  it('opens the file and explains the error when the local config is not JSON', async () => {
    mockedReadFile.mockResolvedValue('nope')

    expect(await getLocalConfiguration()).toBeUndefined()
    expect(mockedShowError).toHaveBeenCalledWith(
      expect.stringContaining('valid JSON'),
      { modal: true }
    )
  })
})

describe('saving the configuration', () => {
  it('writes the global config and returns its path', async () => {
    expect(await saveGlobalRcFile('{}')).toEqual(globalPath)
    expect(mockedCreateFile).toHaveBeenCalledWith(globalPath, '{}')
  })

  it('writes the local config and returns its path', async () => {
    expect(await saveLocalConfigFile('{}')).toEqual(localPath)
    expect(mockedCreateFile).toHaveBeenCalledWith(localPath, '{}')
  })

  it('creates the targets array when the config has none', async () => {
    mockedReadFile.mockRejectedValue(new Error('ENOENT'))

    await saveToConfigFile(new Target(targetJson), true)

    expect(mockedCreateFile).toHaveBeenCalledWith(localPath, expect.any(String))
    expect(JSON.parse(mockedCreateFile.mock.calls[0][1])).toEqual({
      targets: [new Target(targetJson).toJson(false)]
    })
  })

  it('replaces an existing target rather than adding a duplicate', async () => {
    mockedReadFile.mockResolvedValue(
      JSON.stringify({ targets: [{ ...targetJson, appLoc: '/Old/app' }] })
    )

    await saveToConfigFile(new Target(targetJson), true)

    const written = JSON.parse(mockedCreateFile.mock.calls[0][1])
    expect(written.targets).toHaveLength(1)
    expect(written.targets[0].appLoc).toEqual('/Public/app')
  })

  it('appends a target that is not in the config yet', async () => {
    mockedReadFile.mockResolvedValue(
      JSON.stringify({
        targets: [
          { name: 'other', serverUrl: 'x', serverType: ServerType.Sasjs }
        ]
      })
    )

    await saveToConfigFile(new Target(targetJson), true)

    const written = JSON.parse(mockedCreateFile.mock.calls[0][1])
    expect(written.targets.map((t: any) => t.name)).toEqual(['other', 'server'])
  })

  it('saves to the global file when the target is not local', async () => {
    mockedReadFile.mockRejectedValue(new Error('ENOENT'))

    await saveToConfigFile(new Target(targetJson), false)

    expect(mockedCreateFile).toHaveBeenCalledWith(
      globalPath,
      expect.any(String)
    )
  })
})

describe('removing a target', () => {
  it('refuses when the global config has no targets', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify({ targets: [] }))

    await expect(removeTargetFromGlobalRcFile()).rejects.toThrow(
      'No target found in global config file!'
    )
  })

  it('refuses when no target is selected', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify({ targets: [targetJson] }))
    mockedChoiceInput.mockResolvedValue(undefined)

    await expect(removeTargetFromGlobalRcFile()).rejects.toThrow(
      'No target selected!'
    )
  })

  it('removes the selected target and keeps the rest', async () => {
    mockedReadFile.mockResolvedValue(
      JSON.stringify({
        targets: [
          targetJson,
          { name: 'other', serverUrl: 'x', serverType: ServerType.Sasjs }
        ]
      })
    )
    mockedChoiceInput.mockResolvedValue('server')

    await removeTargetFromGlobalRcFile()

    const written = JSON.parse(mockedCreateFile.mock.calls[0][1])
    expect(written.targets.map((t: any) => t.name)).toEqual(['other'])
  })

  it('clears the extension setting when it pointed at the removed target', async () => {
    const update = jest.fn()
    mockedGetConfiguration.mockReturnValue(
      extensionConfig({ target: 'server' }, update)
    )
    mockedReadFile.mockResolvedValue(JSON.stringify({ targets: [targetJson] }))
    mockedChoiceInput.mockResolvedValue('server')

    await removeTargetFromGlobalRcFile()

    expect(update).toHaveBeenCalledWith('target', '', true)
  })

  it('leaves the extension setting alone when it points elsewhere', async () => {
    const update = jest.fn()
    mockedGetConfiguration.mockReturnValue(
      extensionConfig({ target: 'other' }, update)
    )
    mockedReadFile.mockResolvedValue(JSON.stringify({ targets: [targetJson] }))
    mockedChoiceInput.mockResolvedValue('server')

    await removeTargetFromGlobalRcFile()

    expect(update).not.toHaveBeenCalled()
  })
})

describe('resolving auth config', () => {
  const sasjsTarget = () =>
    new Target({ ...targetJson, serverType: ServerType.Sasjs })

  it('returns nothing for a SASjs target on a server that is not in server mode', async () => {
    mockedServerMode.mockResolvedValue(false)

    expect(await getAuthConfig(sasjsTarget())).toBeUndefined()
    expect(mockedAuthenticate).not.toHaveBeenCalled()
  })

  it('returns the auth config carried by the target', async () => {
    mockedServerMode.mockResolvedValue(true)
    const authConfig = {
      client: 'cli',
      secret: 'sec',
      access_token: 'a',
      refresh_token: 'r'
    }

    expect(
      await getAuthConfig(
        new Target({ ...targetJson, serverType: ServerType.Sasjs, authConfig })
      )
    ).toEqual(authConfig)
  })

  it('reads the target env file before anything else', async () => {
    mockedServerMode.mockResolvedValue(true)
    mockedGetConfiguration.mockReturnValue(extensionConfig({ isLocal: true }))
    mockedFileExists.mockResolvedValue(true)
    mockedReadFile.mockResolvedValue(
      'CLIENT=cli\nSECRET=sec\nACCESS_TOKEN=a\nREFRESH_TOKEN=r\n'
    )

    expect(
      await getAuthConfig(
        new Target({ ...targetJson, serverType: ServerType.Sasjs })
      )
    ).toMatchObject({ client: 'cli', secret: 'sec' })
    expect(mockedReadFile).toHaveBeenCalledWith(
      path.join('/project', '.env.server')
    )
  })

  it('falls back to authenticating the target and saving the result', async () => {
    mockedServerMode.mockResolvedValue(true)
    mockedAuthenticate.mockResolvedValue({
      ...targetJson,
      authConfig: { client: 'c' }
    })
    mockedFileExists.mockResolvedValue(false)
    mockedAuthenticate.mockResolvedValue({
      ...targetJson,
      authConfig: { client: 'c' }
    })

    expect(
      await getAuthConfig(
        new Target({ ...targetJson, serverType: ServerType.Sasjs })
      )
    ).toEqual({ client: 'c' })
    expect(mockedCreateFile).toHaveBeenCalled()
  })

  it('decodes the SAS9 password from the target', async () => {
    // {sasjs_encoded}<base64 of a 200-char prefix plus the password>
    const password = encodeToBase64('s3cret')

    expect(
      await getAuthConfigSas9(
        new Target({
          ...targetJson,
          authConfigSas9: { userName: 'u', password }
        })
      )
    ).toEqual({ userName: 'u', password: 's3cret' })
  })

  it('reads SAS9 credentials from an env file', async () => {
    mockedGetConfiguration.mockReturnValue(extensionConfig({ isLocal: true }))
    mockedFileExists.mockResolvedValue(true)
    mockedReadFile.mockResolvedValue(
      `SAS_USERNAME=u\nSAS_PASSWORD=${encodeToBase64('pw')}\n`
    )

    expect(
      await getAuthConfigSas9(
        new Target({ ...targetJson, serverType: ServerType.Sas9 })
      )
    ).toEqual({ userName: 'u', password: 'pw' })
  })

  it('authenticates and saves a SAS9 target with no credentials anywhere', async () => {
    mockedFileExists.mockResolvedValue(false)
    mockedAuthenticate.mockResolvedValue({
      ...targetJson,
      authConfigSas9: { userName: 'u', password: encodeToBase64('pw') }
    })

    const result = await getAuthConfigSas9(
      new Target({ ...targetJson, serverType: ServerType.Sas9 })
    )

    expect(result.userName).toEqual('u')
    // NOTE: the password is passed through still encoded on this path, unlike
    // the stored-config case above which returns it decoded. Pinned here so the
    // inconsistency is visible rather than implied.
    expect(decodeFromBase64(result.password)).toEqual('pw')
    expect(mockedCreateFile).toHaveBeenCalled()
  })
})
