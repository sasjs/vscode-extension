import { OutputChannel } from 'vscode'
import SASjs from '@sasjs/adapter/node'
import { Target, ServerType, decodeFromBase64 } from '@sasjs/utils'
import { getAuthConfig, getAuthConfigSas9 } from '../../../utils/config'

export const executeCode = async (
  target: Target,
  code: string,
  outputChannel: OutputChannel
) => {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType,
    appLoc: target.appLoc,
    contextName: target.contextName,
    httpsAgentOptions: target.httpsAgentOptions,
    useComputeApi: true,
    debug: true
  })

  if (target.serverType === ServerType.SasViya) {
    return await executeOnSasViya(sasjs, target, code, outputChannel)
  }

  if (target.serverType === ServerType.Sas9) {
    return await executeOnSas9(sasjs, target, code, outputChannel)
  }

  return await executeOnSasJS(sasjs, target, code, outputChannel)
}

const executeOnSasViya = async (
  sasjs: SASjs,
  target: Target,
  code: string,
  outputChannel: OutputChannel
) => {
  const authConfig = await getAuthConfig(target, outputChannel)

  const contextName = target.contextName ?? sasjs.getSasjsConfig().contextName

  const { log } = await sasjs.executeScript({
    fileName: 'program.sas',
    linesOfCode: code.split('\n'),
    contextName,
    authConfig
  })

  return { log }
}

const executeOnSas9 = async (
  sasjs: SASjs,
  target: Target,
  code: string,
  outputChannel: OutputChannel
) => {
  const authConfigSas9 = await getAuthConfigSas9(target, outputChannel)
  const userName = authConfigSas9!.userName
  const password = decodeFromBase64(authConfigSas9!.password)

  const executionResult = await sasjs.executeScript({
    linesOfCode: code.split('\n'),
    authConfigSas9: { userName, password }
  })

  return { log: executionResult }
}

const executeOnSasJS = async (
  sasjs: SASjs,
  target: Target,
  code: string,
  outputChannel: OutputChannel
) => {
  const authConfig = await getAuthConfig(target, outputChannel)

  const executionResult = await sasjs.executeScript({
    linesOfCode: code.split('\n'),
    runTime: 'sas',
    authConfig
  })

  return { log: executionResult }
}
