import { OutputChannel, workspace } from 'vscode'

import { Target, Configuration } from '@sasjs/utils/types'
import { getChoiceInput, getIsDefault, getCreateNewTarget } from './input'

import { getGlobalConfiguration } from './config'
import { createTarget } from './createTarget'

/**
 * This function will be called from execute command for selecting target before execution
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
    let target
    if (targetName === 'add and select new target') {
      target = await createTarget(outputChannel)
    } else if (!!targetName) {
      const selectedTarget = config.targets.find(
        (t: any) => t.name === targetName
      )
      target = new Target(selectedTarget)
    }
    if (target) {
      await extConfig.update('target', target.name, true)
    }
    return target
  } else {
    return await createTarget(outputChannel)
  }
}

/**
 * This function will be called from select target command for configuration of setting
 */
export const configureTarget = async (outputChannel: OutputChannel) => {
  const config = (await getGlobalConfiguration(outputChannel)) as Configuration

  if (config?.targets?.length) {
    const targetNames = (config?.targets || []).map((t: any) => t.name)
    const targetName = await getChoiceInput(
      [...targetNames, 'add and select new target'],
      'Please select a target'
    )
    let target
    if (targetName === 'add and select new target') {
      target = await createTarget(outputChannel)
    } else if (!!targetName) {
      const selectedTarget = config.targets.find(
        (t: any) => t.name === targetName
      )
      target = new Target(selectedTarget)
    }

    if (target) {
      const extConfig = workspace.getConfiguration('sasjs-for-vscode')
      await extConfig.update('target', target.name, true)
    }
    return target
  } else if (await getCreateNewTarget()) {
    return await createTarget(outputChannel)
  }
}
