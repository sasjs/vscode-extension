import SASjsChannel from './outputChannel'

export const setProcessVariables = () => {
  process.outputChannel = SASjsChannel.getOutputChannel()
}
