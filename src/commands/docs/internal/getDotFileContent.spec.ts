import { listFilesAndSubFoldersInFolder, readFile } from '@sasjs/utils'
import { getBrief, getDotFileContent } from './getDotFileContent'

jest.mock('@sasjs/utils', () => ({
  ...jest.requireActual('@sasjs/utils'),
  listFilesAndSubFoldersInFolder: jest.fn(),
  readFile: jest.fn()
}))

const mockedList = listFilesAndSubFoldersInFolder as jest.Mock
const mockedRead = readFile as jest.Mock

/**
 * A SAS file whose header carries the sections getList reads. The blank line
 * after each section is what ends it - @sasjs/utils' getList stops at the first
 * empty line, so a header without one yields no entries at all.
 */
const sasFile = ({
  brief,
  inputs = [],
  outputs = []
}: {
  brief?: string
  inputs?: string[]
  outputs?: string[]
}) =>
  [
    '/**',
    brief ? `  @brief ${brief}` : null,
    '  <h4> Data Inputs </h4>',
    ...inputs.map((input) => `  @li ${input}`),
    '  ',
    '  <h4> Data Outputs </h4>',
    ...outputs.map((output) => `  @li ${output}`),
    '  ',
    '**/',
    'data work.b;',
    '  set work.a;',
    'run;'
  ]
    .filter((line) => line !== null)
    .join('\n')

const stage = (files: Record<string, string>) => {
  mockedList.mockResolvedValue(Object.keys(files))
  mockedRead.mockImplementation((filePath: string) =>
    Promise.resolve(files[filePath.split(/[\\/]/).pop() as string] ?? '')
  )
}

describe('getBrief', () => {
  it('returns the text after @brief', () => {
    expect(getBrief(sasFile({ brief: 'Load the claims data' }))).toEqual(
      'Load the claims data'
    )
  })

  it('returns undefined for a header without @brief', () => {
    expect(getBrief(sasFile({}))).toBeUndefined()
  })

  it('returns an empty list for a file with no header', () => {
    expect(getBrief('data work.a;\nrun;\n')).toEqual([])
  })
})

describe('getDotFileContent', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedRead.mockReset()
  })

  it('renders a file node, a parameter node and the edge between them', async () => {
    stage({
      'load.sas': sasFile({
        brief: 'Load it',
        inputs: ['work.a'],
        outputs: ['work.b']
      })
    })

    const dot = await getDotFileContent(['/project/sas'], '')

    expect(dot.startsWith('digraph sasjsdoc{')).toBe(true)
    expect(dot).toContain('shape="record"')
    expect(dot).toContain('load_8sas_source.html')
    expect(dot).toContain('label="{LOAD.SAS | Load it}"')
    // a parameter node is drawn as a cylinder, coloured by its libref
    expect(dot).toContain('shape="cylinder"')
    expect(dot).toContain('color="#e6194b"')
    // and each edge points from the parameter to the file that reads it
    expect(dot).toMatch(/ -> \{n\d+\}/)
  })

  it('prefixes parameter nodes with the server url when one is given', async () => {
    stage({ 'load.sas': sasFile({ brief: 'Load it', inputs: ['work.a'] }) })

    const dot = await getDotFileContent(
      ['/project/sas'],
      'https://sas.4gl.io/#/view/viewer/'
    )

    expect(dot).toContain('URL="https://sas.4gl.io/#/view/viewer/WORK.A"')
  })

  it('omits the URL attribute when no server url is given', async () => {
    stage({ 'load.sas': sasFile({ brief: 'Load it', inputs: ['work.a'] }) })

    const dot = await getDotFileContent(['/project/sas'], '')

    expect(dot).not.toContain('URL=')
  })

  it('skips files with no brief, and non-sas files', async () => {
    stage({
      'nobrief.sas': sasFile({ inputs: ['work.a'], outputs: ['work.b'] }),
      'readme.txt': 'not sas at all'
    })

    const dot = await getDotFileContent(['/project/sas'], '')

    expect(dot).not.toContain('shape="record"')
    expect(dot).toEqual('digraph sasjsdoc{\n\n\n}')
  })

  it('skips a file once its only dependencies are DLLs', async () => {
    stage({
      'load.sas': sasFile({ brief: 'Load it', inputs: ['something.dll'] })
    })

    const dot = await getDotFileContent(['/project/sas'], '')

    expect(dot).not.toContain('shape="record"')
    expect(dot).not.toContain('SOMETHING.DLL')
  })

  it('gives one node per parameter however many files use it', async () => {
    stage({
      'first.sas': sasFile({
        brief: 'First',
        inputs: ['work.a'],
        outputs: ['work.b']
      }),
      'second.sas': sasFile({ brief: 'Second', inputs: ['work.a'] })
    })

    const dot = await getDotFileContent(['/project/sas'], '')

    const workANodes = dot
      .split('\n')
      .filter((line) => line.startsWith('n') && line.includes('label="WORK.A"'))
    expect(workANodes).toHaveLength(1)
  })

  it('leaves the colour unset for a key that is not a libref reference', async () => {
    // eight letters before the dot is not a libref, so the node keeps the
    // default colour instead of being painted by populating a type
    stage({ 'load.sas': sasFile({ brief: 'Load it', inputs: ['abcdefgh.a'] }) })

    const dot = await getDotFileContent(['/project/sas'], '')

    expect(dot).toContain('color="#A3D0D4"')
  })
})
