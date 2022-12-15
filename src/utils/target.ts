import { workspace, window, QuickPickItem, QuickPickItemKind } from 'vscode'

import { Target, Configuration, TargetJson } from '@sasjs/utils/types'
import { getTargetChoice } from './input'

import { getGlobalConfiguration, getLocalConfiguration } from './config'
import { createTarget } from './createTarget'
import { setConstants } from './setConstants'

/**
 * This function will be called from execute command for selecting target before execution
 */
export const selectTarget = async () => {
  const globalTargets: TargetJson[] = []
  const localTargets: TargetJson[] = []

  const global = (await getGlobalConfiguration()) as Configuration
  if (global?.targets?.length) {
    globalTargets.push(...global.targets)
  }

  if (process.isSasjsProject) {
    const local = (await getLocalConfiguration()) as Configuration
    if (local?.targets?.length) {
      localTargets.push(...local.targets)
    }
  }

  const extConfig = workspace.getConfiguration('sasjs-for-vscode')
  const targetFromExt = extConfig.get('target') as string
  const isLocal = extConfig.get('isLocal') as boolean

  if (!targetFromExt) {
    return await configureTarget()
  }

  if (isLocal) {
    if (localTargets.length) {
      const selectedTarget = localTargets.find((t) => t.name === targetFromExt)
      if (selectedTarget) {
        return { target: new Target(selectedTarget), isLocal: true }
      }

      window.showErrorMessage(
        'Target specified in extension setting is not available in local config file. Please select another target.'
      )
      return await configureTarget()
    }
    return await configureTarget()
  }

  if (globalTargets.length) {
    const selectedTarget = globalTargets.find((t) => t.name === targetFromExt)
    if (selectedTarget) {
      return { target: new Target(selectedTarget), isLocal: false }
    }

    window.showErrorMessage(
      'Target specified in extension setting is not available in global .sasjsrc file file. Please select another target.'
    )
    return await configureTarget()
  }

  return await configureTarget()
}

/**
 * This function will be called from select target command for configuration of setting
 */
export const configureTarget = async () => {
  const quickPickChoices: QuickPickItem[] = []
  const globalTargets: TargetJson[] = []
  const localTargets: TargetJson[] = []

  const global = (await getGlobalConfiguration()) as Configuration
  if (global?.targets?.length) {
    globalTargets.push(...global.targets)
    quickPickChoices.push({
      label: 'global',
      kind: QuickPickItemKind.Separator
    })
    global.targets.forEach((t) => {
      quickPickChoices.push({
        label: t.name,
        detail: 'global target'
      })
    })
  }

  if (process.isSasjsProject) {
    const local = (await getLocalConfiguration()) as Configuration
    if (local?.targets?.length) {
      localTargets.push(...local.targets)
      quickPickChoices.push({
        label: 'local',
        kind: QuickPickItemKind.Separator
      })
      local.targets.forEach((t) => {
        quickPickChoices.push({
          label: t.name,
          detail: 'local target'
        })
      })
    }
  }

  quickPickChoices.push({
    label: 'add and select new target'
  })
  const choice = await getTargetChoice(
    quickPickChoices,
    'Please select a target'
  )
  let target: Target | undefined
  let isLocal = false

  if (choice?.label === 'add and select new target') {
    return await createTarget()
  }

  if (!!choice?.label) {
    let selectedTarget: TargetJson | undefined
    if (choice.detail === 'global target') {
      selectedTarget = globalTargets.find((t) => t.name === choice.label)
    } else {
      selectedTarget = localTargets.find((t) => t.name === choice.label)
      isLocal = true
    }
    target = new Target(selectedTarget)
  }

  if (target) {
    const extConfig = workspace.getConfiguration('sasjs-for-vscode')
    await extConfig.update('target', target.name, true)
    await extConfig.update('isLocal', isLocal, true)
    await setConstants()
  }
  return { target, isLocal }
}
