import { Target, ServerType, decodeFromBase64 } from '@sasjs/utils'
import { getAuthConfig, getAuthConfigSas9 } from './config'
import { getSASjs } from './getSASjs'

export const executeCode = async (target: Target, code: string) => {
  if (target.serverType === ServerType.SasViya) {
    return await executeOnSasViya(target, code)
  }

  if (target.serverType === ServerType.Sas9) {
    return await executeOnSas9(target, code)
  }

  if (target.serverType === ServerType.Sasjs) {
    return await executeOnSasJS(target, code)
  }

  throw new Error(
    'Invalid server type. Valid serverType are: SASVIYA, SAS9 and SASJS'
  )
}

const executeOnSasViya = async (target: Target, code: string) => {
  const sasjs = getSASjs(target)
  const authConfig = await getAuthConfig(target)

  const contextName = target.contextName ?? sasjs.getSasjsConfig().contextName

  const { log } = await sasjs.executeScript({
    fileName: 'program.sas',
    linesOfCode: code.split('\n'),
    contextName,
    authConfig
  })

  return { log }
}

const executeOnSas9 = async (target: Target, code: string) => {
  const sasjs = getSASjs(target)

  const authConfigSas9 = await getAuthConfigSas9(target)
  const userName = authConfigSas9!.userName
  const password = decodeFromBase64(authConfigSas9!.password)

  const executionResult = await sasjs.executeScript({
    linesOfCode: code.split('\n'),
    authConfigSas9: { userName, password }
  })

  return { log: executionResult }
}

const executeOnSasJS = async (target: Target, code: string) => {
  const sasjs = getSASjs(target)
  const authConfig = await getAuthConfig(target)

  const executionResult = await sasjs.executeScript({
    linesOfCode: code.split('\n'),
    runTime: 'sas',
    authConfig
  })

  return { log: executionResult }
}
