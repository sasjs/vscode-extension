import { OutputChannel, workspace } from 'vscode'

import { Target, Configuration } from '@sasjs/utils/types'
import { getChoiceInput, getIsDefault } from './input'

import { getGlobalConfiguration } from './config'
import { createTarget } from './createTarget'

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
