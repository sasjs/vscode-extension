import { getServerUrl } from '../input'
import * as inputModule from '../input'
import { asyncForEach } from '@sasjs/utils'
import { validateServerUrl } from '@sasjs/utils/types/targetValidators'

describe('getServerUrl', () => {
  it('should resolve with valid server URL', async () => {
    const validUrls = [
      '',
      'http://localhost',
      'http://localhost:5000',
      'https://localhost',
      'https://localhost:5000',
      'https://sasjs.io',
      'https://sasjs.co.uk'
    ]
    let testNumber = 0

    jest.spyOn(inputModule, 'getTextInput').mockImplementation(() => {
      testNumber++

      return Promise.resolve(validateServerUrl(validUrls[testNumber - 1]))
    })

    asyncForEach(validUrls, (validUrl) => {
      expect(getServerUrl()).resolves.toEqual(validUrl)
    })
  })

  it('should reject if server URL is invalid', async () => {
    const validUrls = [
      ' ',
      'test:\\test',
      'http:\\ww.test.com',
      'sasjs.io',
      'www.sasjs.io'
    ]
    let testNumber = 0

    jest.spyOn(inputModule, 'getTextInput').mockImplementation(() => {
      testNumber++

      return Promise.resolve(validateServerUrl(validUrls[testNumber - 1]))
    })

    const expectedError = new Error(
      'Invalid server URL: `serverUrl` should either be an empty string or a valid URL of the form http(s)://your-server.com(:port).'
    )

    asyncForEach(validUrls, () => {
      expect(getServerUrl()).rejects.toEqual(expectedError)
    })
  })
})
