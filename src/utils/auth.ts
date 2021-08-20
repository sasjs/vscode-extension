import SASjs from '@sasjs/adapter/node'
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

export const getAuthUrl = (serverUrl: string, clientId: string) => {
  return `${serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`
}
