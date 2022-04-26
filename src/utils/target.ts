import { OutputChannel, workspace } from 'vscode'

import { Target, Configuration } from '@sasjs/utils/types'
import { getChoiceInput, getIsDefault } from './input'

import { getGlobalConfiguration } from './config'
import { createTarget } from './createTarget'

/**
 * This function will be called from execute command for selecting target before execution
 * @param outputChannel
 * @returns
 */
export const selectTarget = async (outputChannel: OutputChannel) => {
  const config = (await getGlobalConfiguration(outputChannel)) as Configuration

  if (config?.targets?.length) {
    const extConfig = workspace.getConfiguration('sasjs-for-vscode')
    const targetFromExt = extConfig.get('target')
    let inputMessage =
      'Target specified in extension setting is not available in global .sasjsrc file. Please select a target from following list.'
    if (!!targetFromExt) {
      const selectedTarget = config.targets.find(
        (t: any) => t.name === targetFromExt
      )
      if (selectedTarget) {
        return new Target(selectedTarget)
      }
    } else {
      inputMessage =
        'No target is specified in extension setting. Please select a target from following list.'
    }

    const targetNames = (config?.targets || []).map((t: any) => t.name)
    const targetName = await getChoiceInput(
      [...targetNames, 'add and select new target'],
      inputMessage
    )
    if (targetName === 'add and select new target') {
      const target = await createTarget(outputChannel)
      const isDefault = await getIsDefault()
      if (isDefault) {
        await extConfig.update('target', target.name, true)
      }
      return target
    } else if (!!targetName) {
      const isDefault = await getIsDefault()
      if (isDefault) {
        await extConfig.update('target', targetName, true)
      }
      const selectedTarget = config.targets.find(
        (t: any) => t.name === targetName
      )
      return new Target(selectedTarget)
    }
  } else {
    return await createTarget(outputChannel)
  }
}

/**
 * This function will be called from select target command for configuration of setting
 * @param outputChannel
 * @returns
 */
export const configureTarget = async (outputChannel: OutputChannel) => {
  const config = (await getGlobalConfiguration(outputChannel)) as Configuration

  if (config?.targets?.length) {
    const extConfig = workspace.getConfiguration('sasjs-for-vscode')
    const targetNames = (config?.targets || []).map((t: any) => t.name)
    const targetName = await getChoiceInput(
      [...targetNames, 'add and select new target'],
      'Please select a target'
    )
    if (targetName === 'add and select new target') {
      const target = await createTarget(outputChannel)
      const isDefault = await getIsDefault()
      if (isDefault) {
        await extConfig.update('target', target.name, true)
      }
      return target
    } else if (!!targetName) {
      const isDefault = await getIsDefault()
      if (isDefault) {
        await extConfig.update('target', targetName, true)
      }
      const selectedTarget = config.targets.find(
        (t: any) => t.name === targetName
      )
      return new Target(selectedTarget)
    }
  } else {
    const response = await getChoiceInput(
      ['Yes', 'No'],
      'No targets are found. Would you like to create a new target?'
    )
    if (response === 'Yes') return await createTarget(outputChannel)
  }
}
