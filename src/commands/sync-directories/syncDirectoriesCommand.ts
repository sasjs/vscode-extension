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

import {
  compareHashes,
  findResourcesNotPresentLocally,
  getHash,
  generateProgramToGetRemoteHash,
  generateProgramToSyncHashDiff,
  getRelativePath
} from '@sasjs/utils'
import { getTimestamp } from '../../utils/utils'

export class SyncDirectoriesCommand {
  private outputChannel: OutputChannel

  constructor(private context: ExtensionContext) {
    this.outputChannel = window.createOutputChannel('SASjs')
  }

  initialise = () => {
    const syncDirectoriesCommand = commands.registerCommand(
      'sasjs-for-vscode.syncDirectories',
      () => this.execute()
    )
    this.context.subscriptions.push(syncDirectoriesCommand)
  }

  private execute = async () => {
    const target = await selectTarget(this.outputChannel).catch((error) => {
      this.outputChannel.appendLine('SASjs: Error selecting target: ')
      this.outputChannel.appendLine(error)
      this.outputChannel.appendLine(error.message)
      this.outputChannel.appendLine(JSON.stringify(error, null, 2))
      this.outputChannel.show()
    })

    if (!target) {
      window.showErrorMessage(
        'An unexpected error occurred while selecting target.'
      )
      return
    }

    if (!target.syncDirectories?.length) {
      window.showErrorMessage('There are no directories to sync.')
      return
    }

    commands.executeCommand('setContext', 'isSyncingDirectories', true)

    Promise.all(
      target.syncDirectories.map(async (item) => {
        const remoteFolderPath = item.remote
        const localFolderPath = item.local

        const resultsFolder = workspace.workspaceFolders?.length
          ? path.join(
              workspace.workspaceFolders![0].uri.fsPath,
              'sasjsresults',
              `${getTimestamp()}`
            )
          : path.join(os.homedir(), 'sasjsresults', `${getTimestamp()}`)

        this.outputChannel.appendLine(
          `generating program to get hash of remote folder ${remoteFolderPath}`
        )
        const program = await generateProgramToGetRemoteHash(remoteFolderPath)

        this.outputChannel.appendLine(
          `executing program to get hash of remote folder ${remoteFolderPath}`
        )
        const { log } = await executeCode(target, program, this.outputChannel)
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
          return
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

        this.outputChannel.appendLine(
          `executing program to sync differences between local (${localFolderPath}) and remote (${remoteFolderPath})`
        )
        const { log: syncLog } = await executeCode(
          target,
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
      })
    )
      .catch((err) => {
        window.showErrorMessage(err.message)
        return
      })
      .finally(() =>
        commands.executeCommand('setContext', 'isSyncingDirectories', false)
      )
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
