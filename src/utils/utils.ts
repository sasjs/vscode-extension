import * as path from 'path'
import * as os from 'os'
import axios from 'axios'
import { window, workspace, ViewColumn } from 'vscode'
import {
  Target,
  timestampToYYYYMMDDHHMMSS,
  folderExists,
  copy
} from '@sasjs/utils'
import { createFile } from './file'

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

export const handleErrorResponse = async (e: any, message: string) => {
  process.outputChannel.appendLine(`SASjs: ${message}: `)
  process.outputChannel.appendLine(e)
  process.outputChannel.appendLine(e.message)
  process.outputChannel.appendLine(JSON.stringify(e, null, 2))
  process.outputChannel.show()

  const { log } = e
  if (log) {
    await createAndOpenLogFile(log)
  } else if (e.message) {
    await createAndOpenLogFile(e.message)
  }
}

export const createAndOpenLogFile = async (log: string, filePath?: string) => {
  const { buildDestinationResultsFolder: resultsFolder } =
    process.sasjsConstants

  const timestamp = getTimestamp()
  const resultsPath = filePath || path.join(resultsFolder, `${timestamp}.log`)

  process.outputChannel.appendLine(
    `SASjs: Attempting to create log file at ${resultsPath}.`
  )

  process.outputChannel.show()

  await createFile(resultsPath, log)
  const document = await workspace.openTextDocument(resultsPath)
  window.showTextDocument(document, {
    viewColumn: ViewColumn.Beside
  })
}
