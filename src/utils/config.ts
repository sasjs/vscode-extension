import * as path from 'path'
import * as os from 'os'
import { OutputChannel, window, workspace } from 'vscode'
import { decodeFromBase64, fileExists } from '@sasjs/utils'
import { Target, AuthConfig, ServerType, AuthConfigSas9 } from '@sasjs/utils'
import dotenv from 'dotenv'
import { createFile, readFile } from './file'
import { getChoiceInput } from './input'
import { authenticateTarget } from './auth'
import {
  getLocalConfigurationPath,
  isSasjsProject,
  isSasJsServerInServerMode
} from './utils'

export async function saveToConfigFile(
  buildTarget: Target,
  isLocal: boolean,
  outputChannel: OutputChannel
) {
  let config = isLocal
    ? await getLocalConfiguration(outputChannel)
    : await getGlobalConfiguration(outputChannel)

  const targetJson = buildTarget.toJson()
  if (config) {
    if (config.targets && config.targets.length) {
      const existingTargetIndex = config.targets.findIndex(
        (t: Target) => t.name === buildTarget.name
      )
      if (existingTargetIndex > -1) {
        config.targets[existingTargetIndex] = targetJson
      } else {
        config.targets.push(targetJson)
      }
    } else {
      config.targets = [targetJson]
    }
  } else {
    config = { targets: [targetJson] }
  }

  const saveFunction = isLocal ? saveLocalConfigFile : saveGlobalRcFile

  return await saveFunction(JSON.stringify(config, null, 2), outputChannel)
}

export async function removeTargetFromGlobalRcFile(
  outputChannel: OutputChannel
) {
  const globalConfig = await getGlobalConfiguration(outputChannel)

  if (globalConfig) {
    if (!globalConfig?.targets.length) {
      throw new Error('No target found in global config file!')
    }

    const targetNames = (globalConfig?.targets || []).map((t: any) => t.name)
    const targetName = await getChoiceInput(
      [...targetNames],
      'Please select a target you want to delete'
    )

    if (!targetName) {
      throw new Error('No target selected!')
    }
    const targetIndex = globalConfig.targets.findIndex(
      (t: Target) => t.name === targetName
    )
    globalConfig.targets.splice(targetIndex, 1)

    const extConfig = workspace.getConfiguration('sasjs-for-vscode')
    const targetFromExt = extConfig.get('target')

    if (targetFromExt === targetName) {
      await extConfig.update('target', '', true)
    }

    return await saveGlobalRcFile(
      JSON.stringify(globalConfig, null, 2),
      outputChannel
    )
  }
}

export async function saveGlobalRcFile(
  content: string,
  outputChannel: OutputChannel
) {
  const rcFilePath = path.join(os.homedir(), '.sasjsrc')
  outputChannel.appendLine(
    `SASjs: Saving global configuration to ${rcFilePath}`
  )

  await createFile(rcFilePath, content)

  return rcFilePath
}

export async function saveLocalConfigFile(
  content: string,
  outputChannel: OutputChannel
) {
  const configPath = getLocalConfigurationPath()
  outputChannel.appendLine(`SASjs: Saving local configuration to ${configPath}`)

  await createFile(configPath, content)

  return configPath
}

export const getGlobalConfiguration = async (outputChannel: OutputChannel) => {
  const sasjsConfigPath = path.join(os.homedir(), '.sasjsrc')
  let configFile

  try {
    configFile = await readFile(sasjsConfigPath)
  } catch {
    outputChannel.appendLine(
      'A global SASjs config file was not found in your home directory.'
    )
    return null
  }

  try {
    const configJson = JSON.parse(configFile)
    return configJson
  } catch {
    outputChannel.appendLine(
      'There was an error parsing your global SASjs config file.'
    )
    window.showErrorMessage(
      'There was an error parsing your global SASjs config file (~/.sasjsrc). Please ensure that the file is valid JSON.',
      { modal: true }
    )

    const document = await workspace.openTextDocument(sasjsConfigPath)
    await window.showTextDocument(document)
    return null
  }
}

export const getLocalConfiguration = async (outputChannel: OutputChannel) => {
  const sasjsConfigPath = getLocalConfigurationPath()
  let configFile

  try {
    configFile = await readFile(sasjsConfigPath)
  } catch {
    outputChannel.appendLine('A local SASjs config file was not found.')
    return null
  }

  try {
    const configJson = JSON.parse(configFile)
    return configJson
  } catch {
    outputChannel.appendLine(
      'There was an error parsing your local SASjs config file.'
    )
    window.showErrorMessage(
      'There was an error parsing your local SASjs config file. Please ensure that the file is valid JSON.',
      { modal: true }
    )

    const document = await workspace.openTextDocument(sasjsConfigPath)
    await window.showTextDocument(document)
    return null
  }
}

export const getAuthConfig = async (
  target: Target,
  outputChannel: OutputChannel
): Promise<AuthConfig | undefined> => {
  if (
    target.serverType === ServerType.Sasjs &&
    !(await isSasJsServerInServerMode(target))
  ) {
    return
  }

  if (target.authConfig) {
    return target.authConfig
  }

  const extConfig = workspace.getConfiguration('sasjs-for-vscode')
  const isLocal = extConfig.get('isLocal') as boolean

  if ((await isSasjsProject()) && isLocal) {
    const authConfig = (await getAuthConfigFromEnvFile(
      target.name,
      target.serverType
    )) as AuthConfig
    if (authConfig) {
      return authConfig
    }
  }

  const targetJson = await authenticateTarget(target, isLocal, outputChannel)

  if (targetJson?.authConfig) {
    const updatedTarget = new Target(targetJson)
    await saveToConfigFile(updatedTarget, isLocal, outputChannel)
    return targetJson.authConfig
  }

  return await getAuthConfig(target, outputChannel)
}

export const getAuthConfigSas9 = async (
  target: Target,
  outputChannel: OutputChannel
): Promise<AuthConfigSas9> => {
  const authConfig = target.authConfigSas9
  if (authConfig) {
    return {
      userName: authConfig.userName,
      password: decodeFromBase64(authConfig.password)
    }
  }

  const extConfig = workspace.getConfiguration('sasjs-for-vscode')
  const isLocal = extConfig.get('isLocal') as boolean

  if ((await isSasjsProject()) && isLocal) {
    const authConfigSas9 = (await getAuthConfigFromEnvFile(
      target.name,
      target.serverType
    )) as AuthConfigSas9
    if (authConfigSas9) {
      return authConfigSas9
    }
  }

  const targetJson = await authenticateTarget(target, isLocal, outputChannel)

  if (targetJson?.authConfigSas9) {
    const updatedTarget = new Target(targetJson)
    await saveToConfigFile(updatedTarget, isLocal, outputChannel)
    return targetJson.authConfigSas9
  }

  return await getAuthConfigSas9(target, outputChannel)
}

const getAuthConfigFromEnvFile = async (
  targetName: string,
  serverType: ServerType
) => {
  const targetEnvFilePath = path.join(
    workspace.workspaceFolders![0].uri.fsPath,
    `.env.${targetName}`
  )

  if (await fileExists(targetEnvFilePath)) {
    const targetEnvFileContent = await readFile(targetEnvFilePath)
    const targetEnvConfig = dotenv.parse(targetEnvFileContent)

    if (serverType === ServerType.Sas9) {
      return {
        userName: targetEnvConfig.SAS_USERNAME,
        password: decodeFromBase64(targetEnvConfig.SAS_PASSWORD ?? '')
      } as AuthConfigSas9
    }

    return {
      client: targetEnvConfig.CLIENT,
      secret: targetEnvConfig.SECRET,
      access_token: targetEnvConfig.ACCESS_TOKEN,
      refresh_token: targetEnvConfig.REFRESH_TOKEN
    } as AuthConfig
  }
}
