declare namespace NodeJS {
  export interface Process {
    projectDir: string
    isSasjsProject: boolean
    sasjsConstants: import('../constants').Constants
    outputChannel: import('vscode').OutputChannel
  }
}
