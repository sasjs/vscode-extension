import * as vscode from 'vscode'

export async function createFile(filePath: string, content: string) {
  return await vscode.workspace.fs.writeFile(
    vscode.Uri.parse(filePath),
    Buffer.from(content)
  )
}

export async function readFile(filePath: string) {
  return await vscode.workspace.fs
    .readFile(vscode.Uri.parse(filePath))
    .then((content) => Buffer.from(content).toString('utf8'))
}
