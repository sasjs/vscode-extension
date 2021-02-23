import { workspace, Uri } from 'vscode'

export async function createFile(filePath: string, content: string) {
  return await workspace.fs.writeFile(Uri.file(filePath), Buffer.from(content))
}

export async function readFile(filePath: string) {
  return await workspace.fs
    .readFile(Uri.file(filePath))
    .then((content) => Buffer.from(content).toString('utf8'))
}
