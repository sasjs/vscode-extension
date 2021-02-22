import SASjs from '@sasjs/adapter/node'

export const getTokens = async (
  sasjsInstance: SASjs,
  clientId: string,
  clientSecret: string,
  authCode: string
) => {
  const authResponse = await sasjsInstance.getAccessToken(
    clientId,
    clientSecret,
    authCode
  )

  return authResponse
}

export const getAuthUrl = (serverUrl: string, clientId: string) => {
  return `${serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`
}
