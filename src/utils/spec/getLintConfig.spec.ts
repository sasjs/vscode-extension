import * as os from 'os'
import * as path from 'path'
import { workspace } from 'vscode'
import { DefaultLintConfiguration, LintConfig } from '@sasjs/lint'
import * as fileModule from '../file'
import { getLintConfig } from '../getLintConfig'

jest.mock('vscode', () => ({
  workspace: { getConfiguration: jest.fn() }
}))

jest.mock('@sasjs/utils', () => ({
  ...jest.requireActual('@sasjs/utils'),
  fileExists: jest.fn()
}))

jest.mock('../file', () => ({ readFile: jest.fn() }))

const mockedReadFile = fileModule.readFile as jest.Mock
const mockedGetConfiguration = workspace.getConfiguration as jest.Mock
const mockedFileExists = require('@sasjs/utils').fileExists as jest.Mock

const homeConfig = path.join(os.homedir(), '.sasjslint')
const projectConfig = path.join('/project', '.sasjslint')

// The manifest declares `lintConfig: {}` as the default, so the editor always
// hands back an object; `{}` here mirrors that rather than an absent setting.
const withExtensionSetting = (values: Record<string, unknown>) =>
  mockedGetConfiguration.mockReturnValue({
    get: (key: string) => values[key]
  })

beforeEach(() => {
  jest.clearAllMocks()
  process.projectDir = '/project'
  mockedFileExists.mockResolvedValue(false)
  mockedReadFile.mockRejectedValue(new Error('ENOENT'))
  withExtensionSetting({ lintConfig: {} })
})

describe('getLintConfig', () => {
  it('falls back to the default configuration', async () => {
    const config = await getLintConfig()

    expect(config).toBeInstanceOf(LintConfig)
    expect(config).toEqual(new LintConfig(DefaultLintConfiguration))
    expect(mockedReadFile).toHaveBeenCalledWith(homeConfig)
  })

  it('reads .sasjslint from the project when one is there', async () => {
    mockedFileExists.mockResolvedValue(true)
    mockedReadFile.mockResolvedValue(
      JSON.stringify({ ...DefaultLintConfiguration, indentationMultiple: 4 })
    )

    const config = await getLintConfig()

    expect(mockedReadFile).toHaveBeenCalledWith(projectConfig)
    expect(config.indentationMultiple).toEqual(4)
  })

  it('merges the extension setting over the defaults', async () => {
    withExtensionSetting({ lintConfig: { indentationMultiple: 3 } })

    const config = await getLintConfig()

    expect(config.indentationMultiple).toEqual(3)
  })

  it('ignores an empty extension setting', async () => {
    withExtensionSetting({ lintConfig: {} })

    expect(await getLintConfig()).toEqual(
      new LintConfig(DefaultLintConfiguration)
    )
  })

  it('reports a project .sasjslint that is not JSON, naming the file', async () => {
    // A malformed file is not an absent one: falling back would lint against
    // rules the file does not state, and mark the code with them.
    mockedFileExists.mockResolvedValue(true)
    mockedReadFile.mockResolvedValue('not json')

    const error = (await getLintConfig().catch((e: Error) => e)) as Error

    expect(error).toBeInstanceOf(Error)
    // built with path.join in both places, so the message matches on Windows too
    expect(error.message).toContain(projectConfig)
    expect(error.message).toContain('is not valid JSON')
  })

  it('reports a home .sasjslint that is not JSON too', async () => {
    mockedReadFile.mockResolvedValue('{ "noTrailingSpaces": true // no }')

    await expect(getLintConfig()).rejects.toThrow(
      `${homeConfig} is not valid JSON`
    )
  })
})
