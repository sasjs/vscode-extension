import * as path from 'path'
import * as os from 'os'
import { Target } from '@sasjs/utils/types/target'
import { createFile, readFile } from './file'

export async function saveToGlobalConfig(buildTarget: Target) {
  let globalConfig = await getGlobalRcFile()
  const targetJson = buildTarget.toJson()
  if (globalConfig) {
    if (globalConfig.targets && globalConfig.targets.length) {
      const existingTargetIndex = globalConfig.targets.findIndex(
        (t: Target) => t.name === buildTarget.name
      )
      if (existingTargetIndex > -1) {
        globalConfig.targets[existingTargetIndex] = targetJson
      } else {
        globalConfig.targets.push(targetJson)
      }
    } else {
      globalConfig.targets = [targetJson]
    }
  } else {
    globalConfig = { targets: [targetJson] }
  }
  return await saveGlobalRcFile(JSON.stringify(globalConfig, null, 2))
}

export async function saveGlobalRcFile(content: string) {
  const homeDir = os.homedir()
  const rcFilePath = path.join(homeDir, '.sasjsrc')

  await createFile(rcFilePath, content)

  return rcFilePath
}

export async function getGlobalRcFile() {
  const homeDir = require('os').homedir()
  const sasjsRcFileContent = await readFile(
    path.join(homeDir, '.sasjsrc')
  ).catch(() => null)
  return sasjsRcFileContent
    ? JSON.parse(sasjsRcFileContent)
    : sasjsRcFileContent
}
