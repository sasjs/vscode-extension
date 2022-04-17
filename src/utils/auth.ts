import SASjs from '@sasjs/adapter/node'
import { ServerType } from '@sasjs/utils'

import { OutputChannel } from 'vscode'

export const getTokens = async (
  sasjsInstance: SASjs,
  clientId: string,
  clientSecret: string,
  authCode: string,
  outputChannel: OutputChannel
) => {
  outputChannel.appendLine(
    `Attempting to get access token with client ${clientId} and auth code ${authCode}`
  )
  const authResponse = await sasjsInstance
    .getAccessToken(clientId, clientSecret, authCode)
    .catch((e) => {
      outputChannel.appendLine(
        `Error getting access tokens: ${e?.message || e}`
      )

      throw e
    })

  return authResponse
}

export const getAuthUrl = (
  serverType: ServerType,
  serverUrl: string,
  clientId: string
) =>
  serverType === ServerType.Sasjs
    ? `${serverUrl}/#/SASjsLogon?client_id=${clientId}&response_type=code`
    : `${serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`
