import * as path from 'path'
import * as os from 'os'
import axios from 'axios'
import { window, workspace } from 'vscode'
import { Target, timestampToYYYYMMDDHHMMSS, fileExists } from '@sasjs/utils'

export const getTimestamp = () =>
  timestampToYYYYMMDDHHMMSS()
    .replace(/ /g, '')
    .replace(/\//g, '')
    .replace(/:/g, '')

export const isSasJsServerInServerMode = async (target: Target) => {
  try {
    const res = await axios.get(`${target.serverUrl}/SASjsApi/info`)
    return res.data.mode === 'server'
  } catch (error) {
    throw new Error(
      `An error occurred while fetching server info from ${target.serverUrl}/SASjsApi/info`
    )
  }
}

export const openTargetFile = async () => {
  const extConfig = workspace.getConfiguration('sasjs-for-vscode')
  const isLocal = extConfig.get('isLocal') as boolean
  const sasjsConfigPath = isLocal
    ? getLocalConfigurationPath()
    : path.join(os.homedir(), '.sasjsrc')
  const document = await workspace.openTextDocument(sasjsConfigPath)
  await window.showTextDocument(document)
}

export const isSasjsProject = async () => {
  const localConfigPath = path.join(
    workspace.workspaceFolders![0].uri.fsPath,
    'sasjs',
    'sasjsconfig.json'
  )

  if (await fileExists(localConfigPath)) {
    return true
  }

  return false
}

export const getLocalConfigurationPath = () =>
  path.join(
    workspace.workspaceFolders![0].uri.fsPath,
    'sasjs',
    'sasjsconfig.json'
  )

export const getGlobalConfigurationPath = () =>
  path.join(os.homedir(), '.sasjsrc')
