import * as path from 'path'
import { window, workspace } from 'vscode'
import { decodeFromBase64, fileExists } from '@sasjs/utils'
import { Target, AuthConfig, ServerType, AuthConfigSas9 } from '@sasjs/utils'
import * as dotenv from 'dotenv'
import { createFile, readFile } from './file'
import { getChoiceInput } from './input'
import { authenticateTarget } from './auth'
import {
  getGlobalConfigurationPath,
  getLocalConfigurationPath,
  isSasjsProject,
  isSasJsServerInServerMode
} from './utils'

export async function saveToConfigFile(buildTarget: Target, isLocal: boolean) {
  let config = isLocal
    ? await getLocalConfiguration()
    : await getGlobalConfiguration()

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

  return await saveFunction(JSON.stringify(config, null, 2))
}

export async function removeTargetFromGlobalRcFile() {
  const globalConfig = await getGlobalConfiguration()

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

    return await saveGlobalRcFile(JSON.stringify(globalConfig, null, 2))
  }
}

export async function saveGlobalRcFile(content: string) {
  const rcFilePath = getGlobalConfigurationPath()
  process.outputChannel.appendLine(
    `SASjs: Saving global configuration to ${rcFilePath}`
  )

  await createFile(rcFilePath, content)

  return rcFilePath
}

export async function saveLocalConfigFile(content: string) {
  const configPath = getLocalConfigurationPath()
  process.outputChannel.appendLine(
    `SASjs: Saving local configuration to ${configPath}`
  )

  await createFile(configPath, content)

  return configPath
}

export const getGlobalConfiguration = async () => {
  const sasjsConfigPath = getGlobalConfigurationPath()
  let configFile

  try {
    configFile = await readFile(sasjsConfigPath)
  } catch {
    process.outputChannel.appendLine(
      'A global SASjs config file was not found in your home directory.'
    )
    return null
  }

  try {
    const configJson = JSON.parse(configFile)
    return configJson
  } catch {
    process.outputChannel.appendLine(
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

export const getLocalConfiguration = async () => {
  const sasjsConfigPath = getLocalConfigurationPath()
  let configFile

  try {
    configFile = await readFile(sasjsConfigPath)
  } catch {
    process.outputChannel.appendLine('A local SASjs config file was not found.')
    return null
  }

  try {
    const configJson = JSON.parse(configFile)
    return configJson
  } catch {
    process.outputChannel.appendLine(
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
  target: Target
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
    const targetEnvFilePath = path.join(
      process.projectDir,
      `.env.${target.name}`
    )

    const authConfigFromTargetEnv = (await getAuthConfigFromEnvFile(
      targetEnvFilePath,
      target.serverType
    )) as AuthConfig

    if (authConfigFromTargetEnv) {
      return authConfigFromTargetEnv
    }

    const envFilePath = path.join(process.projectDir, '.env')

    const authConfigFromEnv = (await getAuthConfigFromEnvFile(
      envFilePath,
      target.serverType
    )) as AuthConfig

    if (authConfigFromEnv) {
      return authConfigFromEnv
    }
  }

  const targetJson = await authenticateTarget(target, isLocal)

  if (targetJson?.authConfig) {
    const updatedTarget = new Target(targetJson)
    await saveToConfigFile(updatedTarget, isLocal)
    return targetJson.authConfig
  }

  return await getAuthConfig(target)
}

export const getAuthConfigSas9 = async (
  target: Target
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
    const targetEnvFilePath = path.join(
      process.projectDir,
      `.env.${target.name}`
    )

    const authConfigFromTargetEnv = (await getAuthConfigFromEnvFile(
      targetEnvFilePath,
      target.serverType
    )) as AuthConfigSas9

    if (authConfigFromTargetEnv) {
      return authConfigFromTargetEnv
    }

    const envFilePath = path.join(process.projectDir, '.env')

    const authConfigFromEnv = (await getAuthConfigFromEnvFile(
      envFilePath,
      target.serverType
    )) as AuthConfigSas9

    if (authConfigFromEnv) {
      return authConfigFromEnv
    }
  }

  const targetJson = await authenticateTarget(target, isLocal)

  if (targetJson?.authConfigSas9) {
    const updatedTarget = new Target(targetJson)
    await saveToConfigFile(updatedTarget, isLocal)
    return targetJson.authConfigSas9
  }

  return await getAuthConfigSas9(target)
}

const getAuthConfigFromEnvFile = async (
  envFilePath: string,
  serverType: ServerType
) => {
  if (await fileExists(envFilePath)) {
    const targetEnvFileContent = await readFile(envFilePath)
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
