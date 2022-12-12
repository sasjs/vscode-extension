declare namespace NodeJS {
  export interface Process {
    projectDir: string
    sasjsConstants: import('../constants').Constants
    outputChannel: import('vscode').OutputChannel
  }
}
