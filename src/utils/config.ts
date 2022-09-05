import * as path from 'path'
import { OutputChannel, window, workspace } from 'vscode'
import * as os from 'os'
import { Target } from '@sasjs/utils/types/target'
import { createFile, readFile } from './file'
import { getChoiceInput } from './input'

export async function saveToGlobalConfig(
  buildTarget: Target,
  outputChannel: OutputChannel
) {
  let globalConfig = await getGlobalConfiguration(outputChannel)
  const targetJson = buildTarget.toJson()
  if (globalConfig) {
    if (globalConfig.targets && globalConfig.targets.length) {
      const existingTargetIndex = globalConfig.targets.findIndex(
        (t: Target) => t.name === buildTarget.name
      )
      if (existingTargetIndex > -1) {
        globalConfig.targets[existingTargetIndex] = targetJson
      } else {
        globalConfig.targets.push(targetJson)
      }
    } else {
      globalConfig.targets = [targetJson]
    }
  } else {
    globalConfig = { targets: [targetJson] }
  }

  return await saveGlobalRcFile(
    JSON.stringify(globalConfig, null, 2),
    outputChannel
  )
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
