import { getAbsolutePath } from '@sasjs/utils'
import * as path from 'path'
import {
  ExtensionContext,
  commands,
  window,
  ViewColumn,
  workspace
} from 'vscode'
import {
  getGlobalConfiguration,
  getLocalConfiguration
} from '../../utils/config'
import { createFile } from '../../utils/file'
import { initializeSasjsProject } from '../../utils/initializeSasjsProject'
import { selectTarget } from '../../utils/target'
import { getTimestamp } from '../../utils/utils'
import { generateDocs } from './generateDocs'
import { initDocs } from './initDocs'

export class DocsCommand {
  constructor(private context: ExtensionContext) {}

  initialise = () => {
    const docsCommand = commands.registerCommand('sasjs-for-vscode.docs', () =>
      this.docsCommand()
    )
    this.context.subscriptions.push(docsCommand)
  }

  private docsCommand = async () => {
    await this.executeGenerateDocs()
  }

  private getTargetInfo = async () => {
    if (!process.isSasjsProject) {
      await initializeSasjsProject()
      await initDocs()
    }

    return await selectTarget().catch((err) => {
      handleErrorResponse(err, 'Error selecting target:')
      window.showErrorMessage(
        'An unexpected error occurred while selecting target.'
      )
      return { target: undefined, isLocal: false }
    })
  }

  private async executeGenerateDocs() {
    const { target } = await this.getTargetInfo()

    if (!target) return

    const extConfig = workspace.getConfiguration('sasjs-for-vscode')
    const isLocal = extConfig.get('isLocal') as boolean
    const config = isLocal
      ? await getLocalConfiguration()
      : await getGlobalConfiguration()

    await generateDocs(target, config)
      .then(async (res) => {
        const message = `Docs have been generated!\nThe docs are located in the ${res.outDirectory}' directory.`
        process.outputChannel.appendLine(message)

        const absolutePath = getAbsolutePath(
          res.outDirectory,
          process.projectDir
        )
        const document = await workspace.openTextDocument(
          path.join(absolutePath, 'index.html')
        )
        window.showTextDocument(document)
        window.showInformationMessage(message)
      })
      .catch((err) => {
        handleErrorResponse(err, 'Error generating docs')
      })
  }
}

const createAndOpenLogFile = async (log: string) => {
  const { buildDestinationResultsFolder: resultsFolder } =
    process.sasjsConstants

  const timestamp = getTimestamp()
  const resultsPath = path.join(resultsFolder, `${timestamp}.log`)

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

export const handleErrorResponse = async (e: any, message: string) => {
  process.outputChannel.appendLine(`SASjs: ${message}: `)
  process.outputChannel.appendLine(e)
  process.outputChannel.appendLine(e.message)
  process.outputChannel.appendLine(JSON.stringify(e, null, 2))
  process.outputChannel.show()

  if (e.message) {
    await createAndOpenLogFile(e.message)
  }
}
