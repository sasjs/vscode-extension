import * as path from 'path'
import * as os from 'os'
import { workspace } from 'vscode'
import { LintConfig, DefaultLintConfiguration } from '@sasjs/lint'
import { readFile } from './file'
import { fileExists } from '@sasjs/utils'

/**
 * The rules in force, from the nearest `.sasjslint` and the extension setting.
 *
 * A file that is absent is not an error - the setting, then the defaults, are
 * the documented fallbacks. A file that is present and does not parse is an
 * error: the rules the project states are not the rules that would be applied,
 * so the caller is told (and stops) instead of being handed a configuration
 * nobody wrote. That is the same choice `sasjs lint` makes, with the same
 * message.
 */
export const getLintConfig = async (): Promise<LintConfig> => {
  let config = DefaultLintConfiguration

  let lintConfigPath = path.join(os.homedir(), '.sasjslint')

  if (await fileExists(path.join(process.projectDir, '.sasjslint'))) {
    lintConfigPath = path.join(process.projectDir, '.sasjslint')
  }

  let content: string | null = null

  try {
    content = await readFile(lintConfigPath)
  } catch {
    // No file to read: the editor setting over the defaults.
    const extConfig = workspace.getConfiguration('sasjs-for-vscode')
    const lintConfig = extConfig.get('lintConfig') as Object
    if (Object.keys(lintConfig).length) {
      config = { ...config, ...lintConfig }
    }
  }

  return new LintConfig(
    content === null ? config : parseLintConfig(content, lintConfigPath)
  )
}

/**
 * Parses a `.sasjslint`, naming the file and the reason when it is not JSON.
 *
 * `@sasjs/lint` exports the same helper from 5.3.1, which is what `sasjs lint`
 * reports with; the editor carries its own copy rather than forcing a version
 * floor on a package it consumes for the rules alone.
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
        'https://cli.sasjs.io/sasjslint-schema.json'
    )
  }
}
