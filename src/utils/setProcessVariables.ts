import { setConstants } from './setConstants'
import { setProjectDirDetails } from './setProjectDirDetails'
import SASjsChannel from './outputChannel'

export const setProcessVariables = async () => {
  process.outputChannel = SASjsChannel.getOutputChannel()
  await setProjectDirDetails()
  await setConstants()
}
