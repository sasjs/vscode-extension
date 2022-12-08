import * as os from 'os'
import * as path from 'path'
import {
  window,
  ExtensionContext,
  commands,
  OutputChannel,
  workspace
} from 'vscode'
import { createFile } from '../../utils/file'
import { selectTarget } from '../../utils/target'
import { executeCode } from './internal/executeCode'
import { extractHashArray } from './internal/extractHashArray'
import { getRelativePath } from '@sasjs/utils/file'
import {
  compareHashes,
  findResourcesNotPresentLocally,
  getHash,
  generateProgramToGetRemoteHash,
  generateProgramToSyncHashDiff
} from '@sasjs/utils/fs'
import { getTimestamp } from '../../utils/utils'
import { SyncDirectoryMap, Target } from '@sasjs/utils'
import {
  getGlobalConfiguration,
  getLocalConfiguration
} from '../../utils/config'
import SASjsChannel from '../../utils/outputChannel'

export class SyncDirectoriesCommand {
  private outputChannel: OutputChannel

  constructor(private context: ExtensionContext) {
    this.outputChannel = SASjsChannel.getOutputChannel()
  }

  initialise = () => {
    const syncDirectoriesCommand = commands.registerCommand(
      'sasjs-for-vscode.syncDirectories',
      () => this.execute()
    )
    this.context.subscriptions.push(syncDirectoriesCommand)
  }

  private execute = async () => {
    let target: Target | undefined
    let isLocal: boolean = false

    try {
      ;({ target, isLocal } = await selectTarget(this.outputChannel))
    } catch (error: any) {
      this.outputChannel.appendLine('SASjs: Error selecting target: ')
      this.outputChannel.appendLine(error)
      this.outputChannel.appendLine(error.message)
      this.outputChannel.appendLine(JSON.stringify(error, null, 2))
      this.outputChannel.show()
    }

    if (!target) {
      window.showErrorMessage(
        'An unexpected error occurred while selecting target.'
      )
      return
    }

    const syncDirectories = await getSyncDirectories(
      target,
      isLocal,
      this.outputChannel
    )

    if (!syncDirectories.length) {
      window.showErrorMessage('There are no directories to sync.')
      return
    }

    commands.executeCommand('setContext', 'isSyncingDirectories', true)

    for (const item of syncDirectories) {
      const remoteFolderPath = item.remote
      const localFolderPath = item.local

      const resultsFolder = workspace.workspaceFolders?.length
        ? path.join(
            workspace.workspaceFolders![0].uri.fsPath,
            'sasjsresults',
            `${getTimestamp()}`
          )
        : path.join(os.homedir(), 'sasjsresults', `${getTimestamp()}`)

      try {
        this.outputChannel.appendLine(
          `generating program to get hash of remote folder ${remoteFolderPath}`
        )
        const program = await generateProgramToGetRemoteHash(remoteFolderPath)
        await saveFile(
          program,
          path.join(resultsFolder, 'getRemoteHash.sas'),
          this.outputChannel
        )

        this.outputChannel.appendLine(
          `executing program to get hash of remote folder ${remoteFolderPath}`
        )
        const { log } = await executeCode(target!, program, this.outputChannel)
        await saveFile(
          log,
          path.join(resultsFolder, 'getRemoteHash.log'),
          this.outputChannel
        )

        this.outputChannel.appendLine('extracting hashes from log')
        const remoteHashes = extractHashArray(log)
        await saveFile(
          JSON.stringify(remoteHashes, null, 2),
          path.join(resultsFolder, 'hashesBeforeSync.json'),
          this.outputChannel
        )

        this.outputChannel.appendLine(
          `creating the hash of local folder ${localFolderPath}`
        )
        const localHash = await getHash(localFolderPath)
        await saveFile(
          JSON.stringify(localHash, null, 2),
          path.join(resultsFolder, 'localHash.json'),
          this.outputChannel
        )

        const remoteHashMap = remoteHashes.reduce(
          (map: { [key: string]: string }, item: any) => {
            const relativePath = getRelativePath(
              remoteFolderPath,
              item.FILE_PATH
            )
            map[relativePath] = item.FILE_HASH
            return map
          },
          {}
        )

        if (remoteHashMap[localHash.relativePath] === localHash.hash) {
          window.showInformationMessage(
            `There are no differences between Remote (${remoteFolderPath}) and Local (${localFolderPath}). Already synced.`
          )
          continue
        }

        this.outputChannel.appendLine(
          `Extract differences from local (${localFolderPath}) and remote (${remoteFolderPath}) hash`
        )
        const hashedDiff = compareHashes(localHash, remoteHashMap)
        await saveFile(
          JSON.stringify(hashedDiff, null, 2),
          path.join(resultsFolder, 'hashesDiff.json'),
          this.outputChannel
        )

        this.outputChannel.appendLine(
          `generating program to sync differences between local (${localFolderPath}) and remote (${remoteFolderPath})`
        )
        const syncProgram = await generateProgramToSyncHashDiff(
          hashedDiff,
          remoteFolderPath
        )
        await saveFile(
          syncProgram,
          path.join(resultsFolder, 'syncProgram.sas'),
          this.outputChannel
        )

        this.outputChannel.appendLine(
          `executing program to sync differences between local (${localFolderPath}) and remote (${remoteFolderPath})`
        )
        const { log: syncLog } = await executeCode(
          target!,
          syncProgram,
          this.outputChannel
        )
        await saveFile(
          syncLog,
          path.join(resultsFolder, 'sync.log'),
          this.outputChannel
        )

        const syncedHash = extractHashArray(syncLog)
        await saveFile(
          JSON.stringify(syncedHash, null, 2),
          path.join(resultsFolder, 'hashesAfterSync.json'),
          this.outputChannel
        )
        const syncedHashMap = syncedHash.reduce(
          (map: { [key: string]: string }, item: any) => {
            const relativePath = getRelativePath(
              remoteFolderPath,
              item.FILE_PATH
            )
            map[relativePath] = item.FILE_HASH
            return map
          },
          {}
        )

        const syncedResources: string[] = []

        Object.entries(syncedHashMap).forEach(([key, value]) => {
          if (remoteHashMap[key] !== value) {
            syncedResources.push(key)
          }
        })

        if (syncedResources.length) {
          this.outputChannel.appendLine('The following resources were synced:')
          syncedResources.forEach((item) => {
            this.outputChannel.appendLine(`* ${item}`)
          })
        }

        const resourcesNotPresentLocally = findResourcesNotPresentLocally(
          localHash,
          syncedHashMap
        )

        if (resourcesNotPresentLocally.length) {
          this.outputChannel.appendLine(
            `The following resources are present in remote (${remoteFolderPath}) but not in local (${localFolderPath}) :`
          )
          resourcesNotPresentLocally.forEach((item) => {
            this.outputChannel.appendLine(`* ${item}`)
          })
        }

        window.showInformationMessage(
          `Synced Remote Folder (${remoteFolderPath}) and Local Folder(${localFolderPath}).`
        )

        this.outputChannel.show()
      } catch (error: any) {
        const logPath = path.join(resultsFolder, 'error.log')

        await createErrorLogFile(error, logPath)

        window.showErrorMessage(
          `An error has occurred. For more info see ${logPath}`
        )

        break
      }
    }

    commands.executeCommand('setContext', 'isSyncingDirectories', false)
  }
}

const saveFile = async (
  fileContent: string,
  filePath: string,
  outputChannel: OutputChannel
) => {
  outputChannel.appendLine(`creating result file at ${filePath}`)
  await createFile(filePath, fileContent)
  outputChannel.appendLine(`result file saved to ${filePath}`)
}

const getSyncDirectories = async (
  target: Target,
  isLocal: boolean,
  outputChannel: OutputChannel
) => {
  const config = isLocal
    ? await getLocalConfiguration(outputChannel)
    : await getGlobalConfiguration(outputChannel)

  const rootLevelSyncDirectories: SyncDirectoryMap[] =
    config.syncDirectories || []
  const targetLevelSyncDirectories = target.syncDirectories || []

  return [...rootLevelSyncDirectories, ...targetLevelSyncDirectories]
}

const createErrorLogFile = async (error: any, logPath: string) => {
  if (error.log) {
    return await createFile(logPath, error.log)
  }

  if (error instanceof Error) {
    return await createFile(logPath, error.toString())
  }

  if (typeof error === 'object') {
    return await createFile(logPath, JSON.stringify(error, null, 2))
  }

  await createFile(logPath, error)
}
