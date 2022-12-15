import { Configuration } from '@sasjs/utils'
import { workspace } from 'vscode'
import { getLocalConfiguration, getGlobalConfiguration } from './config'

export const setDefaultTargetDetails = async () => {
  const extConfig = workspace.getConfiguration('sasjs-for-vscode')
  if (process.isSasjsProject) {
    const config = (await getLocalConfiguration()) as Configuration

    if (config?.defaultTarget) {
      extConfig.update('target', config?.defaultTarget, true)
      extConfig.update('isLocal', true, true)

      return
    }
  }

  const config = (await getGlobalConfiguration()) as Configuration
  if (config?.defaultTarget) {
    extConfig.update('target', config?.defaultTarget, true)
    extConfig.update('isLocal', true, true)

    return
  }

  extConfig.update('target', config?.defaultTarget, true)
  extConfig.update('isLocal', false, true)
}
