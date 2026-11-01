import { getDocConfig } from './getDocConfig'
import { Configuration, Target } from '@sasjs/utils/types'

beforeEach(() => {
  process.sasjsConstants = {
    buildDestinationDocsFolder: '/project/sasjsbuild/docs'
  } as any
})

describe('getDocConfig', () => {
  it('falls back to the build docs folder and lineage on', () => {
    expect(getDocConfig()).toMatchObject({
      newOutDirectory: '/project/sasjsbuild/docs',
      enableLineage: true,
      serverUrl: '',
      doxyContent: {}
    })
  })

  it('prefers the command output directory over both configs', () => {
    const config = {
      docConfig: { outDirectory: 'from-config' }
    } as Configuration
    const target = { docConfig: { outDirectory: 'from-target' } } as Target

    expect(
      getDocConfig(target, config, 'from-command').newOutDirectory
    ).toEqual('from-command')
  })

  it('prefers the target output directory over the root one', () => {
    const config = {
      docConfig: { outDirectory: 'from-config' }
    } as Configuration
    const target = { docConfig: { outDirectory: 'from-target' } } as Target

    expect(getDocConfig(target, config).newOutDirectory).toEqual('from-target')
  })

  it('builds the data controller viewer url from the root config', () => {
    const config = {
      docConfig: { dataControllerUrl: 'https://dc.4gl.io/#/edit/some-table' }
    } as Configuration

    expect(getDocConfig(undefined, config).serverUrl).toEqual(
      'https://dc.4gl.io/#/view/viewer/'
    )
  })

  it('lets the target data controller url override the root one', () => {
    const config = {
      docConfig: { dataControllerUrl: 'https://dc.4gl.io/#/edit/root' }
    } as Configuration
    const target = {
      docConfig: { dataControllerUrl: 'https://target.4gl.io/#/edit/target' }
    } as Target

    expect(getDocConfig(target, config).serverUrl).toEqual(
      'https://target.4gl.io/#/view/viewer/'
    )
  })

  it('honours enableLineage in the target and in the root config', () => {
    const config = { docConfig: { enableLineage: false } } as Configuration
    const target = { docConfig: { enableLineage: true } } as Target

    expect(getDocConfig(undefined, config).enableLineage).toBe(false)
    expect(getDocConfig(target, config).enableLineage).toBe(true)
  })

  it('lets target doxy content win per key and keeps the rest', () => {
    const config = {
      docConfig: {
        doxyContent: { PROJECT_NAME: 'Root', PROJECT_BRIEF: 'Root brief' }
      }
    } as Configuration
    const target = {
      docConfig: { doxyContent: { PROJECT_NAME: 'Target' } }
    } as Target

    expect(getDocConfig(target, config).doxyContent).toEqual({
      PROJECT_NAME: 'Target',
      PROJECT_BRIEF: 'Root brief'
    })
  })

  it('refuses a UNC path, which graphviz cannot resolve', () => {
    const config = {
      docConfig: { doxyContent: { path: '//fileserver/share/project' } }
    } as Configuration

    expect(() => getDocConfig(undefined, config)).toThrow(
      /UNC paths are not supported/
    )
  })
})
