import * as path from 'path'
import { window, ExtensionContext, commands, workspace } from 'vscode'
import { createFile } from '../../utils/file'
import { executeCode } from '../../utils/executeCode'
import { getAbsolutePath, getRelativePath } from '@sasjs/utils/file'
import {
  compareHashes,
  findResourcesNotPresentLocally,
  getHash,
  generateProgramToGetRemoteHash,
  generateProgramToSyncHashDiff,
  extractHashArray
} from '@sasjs/utils/fs'
import { getTimestamp, handleErrorResponse } from '../../utils/utils'
import { SyncDirectoryMap, Target } from '@sasjs/utils'
import {
  getGlobalConfiguration,
  getLocalConfiguration
} from '../../utils/config'
import { TargetCommand } from '../../types/commands/targetCommand'

export class SyncDirectoriesCommand extends TargetCommand {
  constructor(private context: ExtensionContext) {
    super()
  }

  initialise = () => {
    const syncDirectoriesCommand = commands.registerCommand(
      'sasjs-for-vscode.syncDirectories',
      () => this.execute()
    )
    this.context.subscriptions.push(syncDirectoriesCommand)
  }

  private execute = async () => {
    const { target, isLocal } = await this.getTargetInfo()

    if (!target) {
      return
    }

    const syncDirectories = await getSyncDirectories(target, isLocal)

    if (!syncDirectories.length) {
      window.showErrorMessage('There are no directories to sync.')
      return
    }

    commands.executeCommand('setContext', 'isSyncingDirectories', true)

    const { buildDestinationResultsFolder } = process.sasjsConstants

    for (const item of syncDirectories) {
      const remoteFolderPath = item.remote
      const localFolderPath = item.local

      const resultsFolder = path.join(
        buildDestinationResultsFolder,
        'fs-sync',
        getTimestamp()
      )

      try {
        process.outputChannel.appendLine(
          `generating program to get hash of remote folder ${remoteFolderPath}`
        )
        const program = await generateProgramToGetRemoteHash(remoteFolderPath)
        await saveFile(program, path.join(resultsFolder, 'getRemoteHash.sas'))

        process.outputChannel.appendLine(
          `executing program to get hash of remote folder ${remoteFolderPath}`
        )
        const { log } = await executeCode(target!, program)
        await saveFile(log, path.join(resultsFolder, 'getRemoteHash.log'))

        process.outputChannel.appendLine('extracting hashes from log')
        const remoteHashes = extractHashArray(log)
        await saveFile(
          JSON.stringify(remoteHashes, null, 2),
          path.join(resultsFolder, 'hashesBeforeSync.json')
        )

        process.outputChannel.appendLine(
          `creating the hash of local folder ${localFolderPath}`
        )
        const localHash = await getHash(
          getAbsolutePath(localFolderPath, process.projectDir)
        )
        await saveFile(
          JSON.stringify(localHash, null, 2),
          path.join(resultsFolder, 'localHash.json')
        )

        const remoteHashMap = remoteHashes.reduce(
          (map: { [key: string]: string }, item: any) => {
            const from = remoteFolderPath.replace(/\//g, path.sep)
            const to = (item.FILE_PATH as string).replace(/\//g, path.sep)
            const relativePath = getRelativePath(from, to)
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

        process.outputChannel.appendLine(
          `Extract differences from local (${localFolderPath}) and remote (${remoteFolderPath}) hash`
        )
        const hashedDiff = compareHashes(localHash, remoteHashMap)
        await saveFile(
          JSON.stringify(hashedDiff, null, 2),
          path.join(resultsFolder, 'hashesDiff.json')
        )

        process.outputChannel.appendLine(
          `generating program to sync differences between local (${localFolderPath}) and remote (${remoteFolderPath})`
        )
        const syncProgram = await generateProgramToSyncHashDiff(
          hashedDiff,
          remoteFolderPath
        )
        await saveFile(syncProgram, path.join(resultsFolder, 'syncProgram.sas'))

        process.outputChannel.appendLine(
          `executing program to sync differences between local (${localFolderPath}) and remote (${remoteFolderPath})`
        )
        const { log: syncLog } = await executeCode(target!, syncProgram)
        await saveFile(syncLog, path.join(resultsFolder, 'sync.log'))

        const syncedHash = extractHashArray(syncLog)
        await saveFile(
          JSON.stringify(syncedHash, null, 2),
          path.join(resultsFolder, 'hashesAfterSync.json')
        )
        const syncedHashMap = syncedHash.reduce(
          (map: { [key: string]: string }, item: any) => {
            const from = remoteFolderPath.replace(/\//g, path.sep)
            const to = (item.FILE_PATH as string).replace(/\//g, path.sep)
            const relativePath = getRelativePath(from, to)
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
          process.outputChannel.appendLine(
            'The following resources were synced:'
          )
          syncedResources.forEach((item) => {
            process.outputChannel.appendLine(`* ${item}`)
          })
        }

        const resourcesNotPresentLocally = findResourcesNotPresentLocally(
          localHash,
          syncedHashMap
        )

        if (resourcesNotPresentLocally.length) {
          process.outputChannel.appendLine(
            `The following resources are present in remote (${remoteFolderPath}) but not in local (${localFolderPath}) :`
          )
          resourcesNotPresentLocally.forEach((item) => {
            process.outputChannel.appendLine(`* ${item}`)
          })
        }

        window.showInformationMessage(
          `Synced Remote Folder (${remoteFolderPath}) and Local Folder(${localFolderPath}).`
        )

        process.outputChannel.show()
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

const saveFile = async (fileContent: string, filePath: string) => {
  process.outputChannel.appendLine(`creating result file at ${filePath}`)
  await createFile(filePath, fileContent)
  process.outputChannel.appendLine(`result file saved to ${filePath}`)
}

const getSyncDirectories = async (target: Target, isLocal: boolean) => {
  const config = isLocal
    ? await getLocalConfiguration()
    : await getGlobalConfiguration()

  const rootLevelSyncDirectories: SyncDirectoryMap[] =
    config?.syncDirectories || []
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
