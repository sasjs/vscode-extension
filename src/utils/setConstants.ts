import * as path from 'path'
import * as os from 'os'
import { workspace } from 'vscode'
import { getGlobalConfiguration, getLocalConfiguration } from './config'
import { getNodeModulePath } from './utils'
import { getAbsolutePath } from '@sasjs/utils'

export const contextName = 'sasjs cli compute context'

export const setConstants = async () => {
  const extConfig = workspace.getConfiguration('sasjs-for-vscode')
  const isLocal = extConfig.get('isLocal') as boolean
  const configuration = isLocal
    ? await getLocalConfiguration()
    : await getGlobalConfiguration()

  const buildOutputFolder =
    configuration?.buildConfig?.buildOutputFolder ||
    (isLocal ? 'sasjsbuild' : '.sasjs/sasjsbuild')

  const buildResultsFolder =
    configuration?.buildConfig?.buildResultsFolder ||
    (isLocal ? 'sasjsresults' : '.sasjs/sasjsresults')

  const homeDir = os.homedir()

  const buildSourceFolder = path.join(isLocal ? process.projectDir : homeDir)
  const buildSourceDbFolder = path.join(
    isLocal ? process.projectDir : homeDir,
    'sasjs',
    'db'
  )

  const buildDestinationFolder = getAbsolutePath(
    buildOutputFolder,
    isLocal ? process.projectDir : homeDir
  )

  const buildDestinationServicesFolder = path.join(
    buildDestinationFolder,
    'services'
  )

  const buildDestinationTestFolder = path.join(buildDestinationFolder, 'tests')
  const buildDestinationJobsFolder = path.join(buildDestinationFolder, 'jobs')
  const buildDestinationDbFolder = path.join(buildDestinationFolder, 'db')
  const buildDestinationDocsFolder = path.join(buildDestinationFolder, 'docs')
  const macroCorePath = await getNodeModulePath('@sasjs/core')

  const buildDestinationResultsFolder = getAbsolutePath(
    buildResultsFolder,
    isLocal ? process.projectDir : homeDir
  )

  const buildDestinationResultsLogsFolder = path.join(
    buildDestinationResultsFolder,
    'logs'
  )

  console.log(
    `[buildDestinationResultsLogsFolder]`,
    buildDestinationResultsLogsFolder
  )

  const sas9CredentialsError =
    'The following attributes were not found:' +
    '\n* SAS_USERNAME' +
    '\n* SAS_PASSWORD' +
    '\nPlease run "sasjs auth" for your specified target to apply the correct credentials.'

  const invalidSasError =
    'Url specified does not contain a valid sas program. Please provide valid url.'

  const sas9GUID = 'pZKd6F95jECvRQlN0LCfdA=='

  process.sasjsConstants = {
    buildSourceFolder,
    buildSourceDbFolder,
    buildDestinationFolder,
    buildDestinationServicesFolder,
    buildDestinationJobsFolder,
    buildDestinationDbFolder,
    buildDestinationDocsFolder,
    buildDestinationResultsFolder,
    buildDestinationResultsLogsFolder,
    buildDestinationTestFolder,
    macroCorePath,
    contextName,
    sas9CredentialsError,
    invalidSasError,
    sas9GUID
  }
}
