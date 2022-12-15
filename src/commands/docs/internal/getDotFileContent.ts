import * as path from 'path'
import {
  listFilesAndSubFoldersInFolder,
  readFile,
  asyncForEach
} from '@sasjs/utils'
import { getFileInputs } from './getFileInputs'
import { getFileOutputs } from './getFileOutputs'
import { populateNodeDictionary } from './populateNodeDictionary'
import { populateParamNodeTypes } from './populateParamNodeTypes'

/**
 * Returns Dot-code
 * @param {string[]} folderList - dot-code will be generated against provided folderList
 * @param {string} serverUrl - prefixes with links to Libs(Inputs/Outputs)
 */
export async function getDotFileContent(
  folderList: string[],
  serverUrl: string
): Promise<string> {
  let nodeDictionary = new Map()
  let fileNodes = new Map()
  let paramNodes = new Map()
  let paramNodeTyes = new Map()

  // Populating both Maps
  await asyncForEach(folderList, async (folder) => {
    const filesNamesInPath = (
      await listFilesAndSubFoldersInFolder(folder)
    ).filter((f: string) => f.endsWith('.sas'))

    await asyncForEach(filesNamesInPath, async (fileName) => {
      const filePath = path.join(folder, fileName)
      const fileContent = await readFile(filePath)
      const fileBrief = getBrief(fileContent)
      if (fileBrief === undefined) return

      fileName = fileName.split(path.sep).pop().toUpperCase()
      const fileInputs = getFileInputs(fileName, fileContent, paramNodes)
      const fileOutputs = getFileOutputs(fileContent, paramNodes)

      if (fileInputs.length === 0 && fileOutputs.length === 0) return

      fileNodes.set(fileName, {
        edges: fileOutputs,
        label: `${fileName} | ${fileBrief}`
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
      })
    })
  })

  populateNodeDictionary(nodeDictionary, paramNodes)
  populateNodeDictionary(nodeDictionary, fileNodes)

  populateParamNodeTypes(paramNodeTyes, paramNodes)

  let dotNodes = '',
    dotVertices = ''

  // Generating Nodes for Dot fileContent
  paramNodes.forEach((node, key) => {
    let color = '#A3D0D4'
    const librefFound = key.match(/^[A-Z]{2,5}\./)
    if (librefFound) color = paramNodeTyes.get(librefFound[0])

    const attrURL = serverUrl ? `URL="${serverUrl + key}"` : ''

    const NDkey = nodeDictionary.get(key)
    dotNodes += `${NDkey} [ label="${node.label}" ${attrURL} shape="cylinder" style="filled" color="${color}"]\n`

    if (node.edges.length) {
      const dotFormatEdges = node.edges
        .map((edgeKey: string) => nodeDictionary.get(edgeKey))
        .join(' ')
      dotVertices += `${nodeDictionary.get(key)} -> {${dotFormatEdges}}\n`
    }
  })

  fileNodes.forEach((node, key) => {
    const url =
      key.toLowerCase().replace(/_/g, '__').replace('.sas', '_8sas') +
      '_source.html'

    const NDkey = nodeDictionary.get(key)
    dotNodes += `${NDkey} [ shape="record" label="{${node.label}}" href="${url}" ]\n`

    if (node.edges.length) {
      const dotFormatEdges = node.edges
        .map((edgeKey: string) => nodeDictionary.get(edgeKey))
        .join(' ')
      dotVertices += `${nodeDictionary.get(key)} -> {${dotFormatEdges}}\n`
    }
  })

  return `digraph sasjsdoc{\n${dotNodes}\n${dotVertices}\n}`
}

export function getBrief(fileContent: string) {
  let fileHeader
  try {
    const hasFileHeader = fileContent.split('/**')[0] !== fileContent
    if (!hasFileHeader) return []
    fileHeader = fileContent.split('/**')[1].split('**/')[0]
  } catch (e) {
    throw new Error(
      'File header parse error.\nPlease make sure your file header is in the correct format.'
    )
  }

  const lines = fileHeader.split('\n').map((s) => (s ? s.trim() : s))

  let brief = lines.find((l) => l.startsWith('@brief'))
  if (brief) brief = brief.replace(/\@brief/g, '').trim()
  return brief
}
