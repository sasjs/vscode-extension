import * as path from 'path'
import * as os from 'os'
import axios from 'axios'
import { window, workspace } from 'vscode'
import {
  Target,
  timestampToYYYYMMDDHHMMSS,
  fileExists,
  folderExists,
  copy
} from '@sasjs/utils'

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
    : getGlobalConfigurationPath()
  const document = await workspace.openTextDocument(sasjsConfigPath)
  await window.showTextDocument(document)
}

export const getLocalConfigurationPath = () =>
  path.join(process.projectDir, 'sasjs', 'sasjsconfig.json')

export const getGlobalConfigurationPath = () =>
  path.join(os.homedir(), '.sasjsrc')

export const getNodeModulePath = async (module: string): Promise<string> => {
  // Check if module is present in project's dependencies
  let projectPath = path.join(process.projectDir, 'node_modules', module)

  if (await folderExists(projectPath)) {
    return projectPath
  }

  const rootFolder = __dirname.split(path.sep)
  rootFolder.pop()

  projectPath = path.join(rootFolder.join(path.sep), 'node_modules', module)

  if (await folderExists(projectPath)) {
    return projectPath
  } else {
    // INFO: root folder is different for Debug Mode (F5)
    const debugRootFolder = __dirname.match(/.*vscode-extension/)

    if (debugRootFolder) {
      projectPath = path.join(debugRootFolder[0], 'node_modules', module)

      if (await folderExists(projectPath)) {
        return projectPath
      }
    }
  }

  return ''
}

export async function setupDoxygen(folderPath: string): Promise<void> {
  const doxyFilesPath =
    process.env.VSCODE_DEBUG_MODE === 'true' ? '../doxy' : './doxy'
  const doxyFolderPathSource = path.join(__dirname, doxyFilesPath)
  const doxyFolderPath = path.join(
    process.projectDir,
    folderPath,
    'sasjs',
    'doxy'
  )
  await copy(doxyFolderPathSource, doxyFolderPath)
}
