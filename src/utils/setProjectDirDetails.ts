import * as path from 'path'
import { workspace } from 'vscode'
import { folderExists, fileExists } from '@sasjs/utils'

export const setProjectDirDetails = async () => {
  let currentLocation = workspace.workspaceFolders![0].uri.fsPath
  process.projectDir = currentLocation
  process.isSasjsProject = false

  const maxLevels = currentLocation.split(path.sep).length
  let i = 1

  while (i <= maxLevels) {
    const folderPath = path.join(currentLocation, 'sasjs')
    const filePath = path.join(folderPath, 'sasjsconfig.json')

    if ((await folderExists(folderPath)) && (await fileExists(filePath))) {
      process.projectDir = currentLocation
      process.isSasjsProject = true
      return
    }

    currentLocation = path.join(currentLocation, '..')
    i++
  }
}
