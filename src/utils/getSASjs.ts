import SASjs from '@sasjs/adapter/node'
import { Target, ServerType } from '@sasjs/utils'

export const getSASjs = (target: Target) => {
  return new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType,
    appLoc: target.appLoc,
    contextName: target.contextName,
    httpsAgentOptions: target.httpsAgentOptions,
    useComputeApi: target.serverType === ServerType.SasViya,
    debug: true
  })
}
