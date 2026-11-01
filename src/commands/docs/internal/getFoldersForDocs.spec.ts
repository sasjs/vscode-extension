import * as path from 'path'
import { getFoldersForDocs } from './getFoldersForDocs'
import { Configuration, Target } from '@sasjs/utils/types'

const projectDir = '/project'

beforeEach(() => {
  process.sasjsConstants = {
    buildSourceFolder: projectDir,
    macroCorePath: '/core/macros'
  } as any
})

describe('getFoldersForDocs', () => {
  it('defaults to the macro core path and nothing else', () => {
    expect(getFoldersForDocs()).toEqual({
      macroCore: ['/core/macros'],
      macro: [],
      program: [],
      service: [],
      job: []
    })
  })

  it('resolves root-level folders against the build source folder', () => {
    const config = {
      macroFolders: ['macros'],
      programFolders: ['programs'],
      serviceConfig: { serviceFolders: ['services'] },
      jobConfig: { jobFolders: ['jobs'] }
    } as Configuration

    expect(getFoldersForDocs(undefined, config)).toEqual({
      macroCore: ['/core/macros'],
      macro: [path.join(projectDir, 'macros')],
      program: [path.join(projectDir, 'programs')],
      service: [path.join(projectDir, 'services')],
      job: [path.join(projectDir, 'jobs')]
    })
  })

  it('appends target folders to the root ones', () => {
    const config = { macroFolders: ['macros'] } as Configuration
    const target = { macroFolders: ['target-macros'] } as Target

    expect(getFoldersForDocs(target, config).macro).toEqual([
      path.join(projectDir, 'macros'),
      path.join(projectDir, 'target-macros')
    ])
  })

  it('keeps the root macro core when the target says nothing about it', () => {
    const config = {} as Configuration
    const target = { macroFolders: ['target-macros'] } as Target

    expect(getFoldersForDocs(target, config).macroCore).toEqual([
      '/core/macros'
    ])
  })

  it('takes the macro core from the target when it sets displayMacroCore', () => {
    const config = {} as Configuration
    const target = { docConfig: { displayMacroCore: false } } as Target

    expect(getFoldersForDocs(target, config).macroCore).toEqual([])
  })

  it('omits the macro core when a root config hides it', () => {
    const config = { docConfig: { displayMacroCore: false } } as Configuration

    expect(getFoldersForDocs(undefined, config).macroCore).toEqual([])
  })

  it('keeps an absolute folder as it is', () => {
    const config = { macroFolders: ['/elsewhere/macros'] } as Configuration

    // an absolute path is normalised rather than joined, so the assertion is
    // spelled the way the helper spells it on every platform
    expect(getFoldersForDocs(undefined, config).macro).toEqual([
      path.normalize('/elsewhere/macros')
    ])
  })
})
