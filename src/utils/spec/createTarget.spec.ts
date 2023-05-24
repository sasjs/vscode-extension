import * as inputModule from '../input'
import * as authModule from '../auth'
import { createTarget } from '../createTarget'
import { ServerType } from '@sasjs/utils/types'
import { saveToConfigFile } from '../config'
import * as configModule from '../config'
import { Target } from '@sasjs/utils/types'

describe('createTarget', () => {
  it('should save to config file created target', async () => {
    const testTargetName = 'testTargetName'
    jest
      .spyOn(inputModule, 'getTargetName')
      .mockImplementation(() => Promise.resolve(testTargetName))

    const testServerUrl = 'http://localhost:5000'
    jest
      .spyOn(inputModule, 'getServerUrl')
      .mockImplementation(() => Promise.resolve(testServerUrl))

    const testServerType = ServerType.Sasjs
    jest
      .spyOn(inputModule, 'getServerType')
      .mockImplementation(() => Promise.resolve(testServerType))

    const mockedTargetJson = {
      name: testTargetName,
      serverUrl: testServerUrl,
      serverType: testServerType,
      appLoc: '/Public/app'
    }
    const mockedTarget = new Target(mockedTargetJson)

    jest
      .spyOn(authModule, 'authenticateTarget')
      .mockImplementation(() => Promise.resolve(mockedTargetJson))

    jest.spyOn(configModule, 'saveToConfigFile')

    await createTarget().catch((err) => {})

    const isLocal = false
    const expectedCallArgument = {
      serverType: mockedTarget.serverType,
      name: mockedTarget.name,
      serverUrl: mockedTarget.serverUrl,
      appLoc: mockedTarget.appLoc,
      deployConfig: mockedTarget.deployConfig
    }

    expect(saveToConfigFile).toHaveBeenCalledWith(
      expect.objectContaining(expectedCallArgument),
      isLocal
    )
  })
})
