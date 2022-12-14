import * as path from 'path'
import {
  ExtensionContext,
  commands,
  window,
  ViewColumn,
  workspace
} from 'vscode'
import { getLocalConfiguration } from '../../utils/config'
import { createFile } from '../../utils/file'
import { getChoiceInput } from '../../utils/input'
import { selectTarget } from '../../utils/target'
import { getTimestamp } from '../../utils/utils'
import { generateDocs } from './generateDocs'
import { generateDot } from './generateDot'
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

    const config = await getLocalConfiguration()

    await generateDocs(target, config)
      .then((res) => {
        const message = `Docs have been generated!\nThe docs are located in the ${res.outDirectory}' directory.\nClick to open: ${res.outDirectory}/index.html`
        process.outputChannel.appendLine(message)
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

const handleErrorResponse = async (e: any, message: string) => {
  process.outputChannel.appendLine(`SASjs: ${message}: `)
  process.outputChannel.appendLine(e)
  process.outputChannel.appendLine(e.message)
  process.outputChannel.appendLine(JSON.stringify(e, null, 2))
  process.outputChannel.show()

  if (e.message) {
    await createAndOpenLogFile(e.message)
  }
}
