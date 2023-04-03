import { commands, ExtensionContext, window, workspace } from 'vscode'
import { selectTarget } from '../../utils/target'
import { getLocalConfiguration } from '../../utils/config'
import * as path from 'path'
import {
  compile,
  compileSingleFile,
  build,
  deploy
} from '@sasjs/cli/build/commands'
import { handleErrorResponse } from '../../utils/utils'
import { TargetCommand } from '../../types/commands/targetCommand'
import { isTestFile } from '@sasjs/utils'

export class CompileBuildDeployCommand extends TargetCommand {
  constructor(private context: ExtensionContext) {
    super()
  }

  async initialise() {
    const compileCommand = commands.registerCommand(
      'sasjs-for-vscode.compileBuildDeploy',
      () => this.compileBuildDeployCommand()
    )

    this.context.subscriptions.push(compileCommand)
  }

  private compileBuildDeployCommand = async () => {
    await this.executeCompileBuildDeploy()
  }

  private async executeCompileBuildDeploy() {
    let currentFolder: string = ''

    if (workspace.workspaceFolders) {
      currentFolder = workspace.workspaceFolders[0].uri.path
    }

    const { target, isLocal } = await this.getTargetInfo()

    // INFO: compile command can be called when sasjsconfig.json or a *.sas file is opened. If a .sas file is opened, only a single file should be compiled. When a sasjsconfig.json is opened an entire project should be compiled.
    if (target && window.activeTextEditor) {
      let isCBDFailed = false
      const { fileName } = window.activeTextEditor.document

      if (fileName.match(/sasjsconfig.json$/)) {
        await compile(target, true).catch((err) => {
          this.handleError(err, 'Compile failed!')

          isCBDFailed = true
        })
      } else {
        const fileTypes = {
          job: 'job',
          service: 'service',
          test: 'test',
          identify: 'identify'
        }
        let fileType: string = fileTypes.identify

        if (isTestFile(fileName)) {
          fileType = fileTypes.test
        } else {
          const localConfig = await getLocalConfiguration()
          let serviceFolders = target.serviceConfig?.serviceFolders
          let jobFolders = target.jobConfig?.jobFolders

          if (serviceFolders === undefined) {
            serviceFolders = localConfig?.serviceConfig?.serviceFolders
          }

          if (serviceFolders && fileType === fileTypes.identify) {
            serviceFolders.forEach((folder) => {
              if (fileName.includes(folder)) {
                fileType = fileTypes.service
              }
            })
          }

          if (jobFolders === undefined) {
            jobFolders = localConfig?.jobConfig?.jobFolders
          }

          if (jobFolders && fileType === fileTypes.identify) {
            jobFolders.forEach((folder) => {
              if (fileName.includes(folder)) {
                fileType = fileTypes.job
              }
            })
          }
        }

        if (fileType === fileTypes.identify) {
          isCBDFailed = true

          this.handleError(
            new Error(
              `File type has not been identified as Service, Job or Test. Please fix service/job config for your target or name file as 'example.test.sas'.`
            ),
            'Compile failed!'
          )
        } else {
          const output = path.join(
            process.sasjsConstants.buildDestinationFolder,
            `${fileType}s`,
            target.name
          )

          await compileSingleFile(
            target,
            fileType,
            fileName,
            output,
            undefined,
            currentFolder
          ).catch((err) => {
            this.handleError(err, 'Single file compile failed!')

            isCBDFailed = true
          })
        }
      }

      if (isCBDFailed) return

      await build(target).catch((err) => {
        this.handleError(err, 'Build failed!')

        isCBDFailed = true
      })

      if (isCBDFailed) return

      await deploy(target, isLocal).catch((err) => {
        this.handleError(err, 'Deploy failed!')

        isCBDFailed = true
      })

      if (!isCBDFailed) {
        window.showInformationMessage(
          'Compile, build and deploy has been successful!'
        )
      }
    }
  }

  private handleError(err: Error, message: string) {
    window.showErrorMessage(message)

    handleErrorResponse(err, message)
  }
}
