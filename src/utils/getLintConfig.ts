import * as path from 'path'
import * as os from 'os'
import { workspace } from 'vscode'
import {
  LintConfig,
  DefaultLintConfiguration,
  lintSchemaUrl
} from '@sasjs/lint'
import { readFile } from './file'
import { fileExists } from '@sasjs/utils'

/**
 * The rules in force, from the nearest `.sasjslint` and the extension setting.
 *
 * A file that is not there is not an error: the setting, then the defaults, are
 * the documented fallbacks. A file that is there and cannot be read or parsed
 * is an error: the rules the project states are not the rules that would be
 * applied, so the caller is told (and stops) instead of being handed a
 * configuration nobody wrote. That is the same choice `sasjs lint` makes, with
 * the same message.
 */
export const getLintConfig = async (): Promise<LintConfig> => {
  const projectConfigPath = path.join(process.projectDir, '.sasjslint')
  const homeConfigPath = path.join(os.homedir(), '.sasjslint')

  const lintConfigPath = (await fileExists(projectConfigPath))
    ? projectConfigPath
    : homeConfigPath

  if (!(await fileExists(lintConfigPath))) {
    let config = DefaultLintConfiguration

    const extConfig = workspace.getConfiguration('sasjs-for-vscode')
    const lintConfig = extConfig.get('lintConfig') as Object

    if (Object.keys(lintConfig).length) {
      config = { ...config, ...lintConfig }
    }

    return new LintConfig(config)
  }

  // The file is there, so a read failure is reported rather than treated as
  // "no configuration" - an unreadable file substituted with the defaults is
  // the same silent rule change this throws for when the file will not parse.
  return new LintConfig(
    parseLintConfig(await readFile(lintConfigPath), lintConfigPath)
  )
}

/**
 * Parses a `.sasjslint`, naming the file and the reason when it is not JSON.
 *
 * The editor carries its own copy of the message rather than importing
 * `parseLintConfig`, but the schema address in it is the linter's own export: an
 * editor resolves a schema's references, and `cli.sasjs.io` only `$ref`s the raw
 * document on another host, which is reported as untrusted and leaves the
 * setting without a description.
 */
const parseLintConfig = (content: string, filePath: string) => {
  try {
    return JSON.parse(content)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    throw new Error(
      `${filePath} is not valid JSON (${reason}).\n` +
        'The file is read as strict JSON, so it cannot carry comments. ' +
        'Every setting, its type and its default are documented in the schema: ' +
        lintSchemaUrl
    )
  }
}
