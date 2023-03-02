import { getAbsolutePath } from '@sasjs/utils'
import * as path from 'path'
import { ExtensionContext, commands, window, workspace } from 'vscode'
import { TargetCommand } from '../../types/commands/targetCommand'
import {
  getGlobalConfiguration,
  getLocalConfiguration
} from '../../utils/config'
import { initializeSasjsProject } from '../../utils/initializeSasjsProject'
import { updateSasjsConstants } from '../../utils/setConstants'
import { selectTarget } from '../../utils/target'
import { handleErrorResponse } from '../../utils/utils'
import { generateDocs } from './generateDocs'
import { initDocs } from './initDocs'

export class DocsCommand extends TargetCommand {
  constructor(private context: ExtensionContext) {
    super()
  }

  initialise = () => {
    const docsCommand = commands.registerCommand('sasjs-for-vscode.docs', () =>
      this.docsCommand()
    )
    this.context.subscriptions.push(docsCommand)
  }

  private docsCommand = async () => {
    await this.executeGenerateDocs()
  }

  protected getTargetInfo = async () => {
    if (!process.isSasjsProject) {
      await initializeSasjsProject()
      await initDocs()
    }

    return await selectTarget()
      .then((res) => {
        if (res.target) {
          updateSasjsConstants(res.target, res.isLocal)
        }
        return res
      })
      .catch((err) => {
        handleErrorResponse(err, 'Error selecting target')

        window.showErrorMessage(
          'An unexpected error occurred while selecting target.'
        )

        return { target: undefined, isLocal: false }
      })
  }

  private async executeGenerateDocs() {
    const { target } = await this.getTargetInfo()

    if (!target) {
      return
    }

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
