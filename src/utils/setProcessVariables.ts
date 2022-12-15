import { setConstants } from './setConstants'
import { setProjectDirDetails } from './setProjectDirDetails'
import { setDefaultTargetDetails } from './setDefaultTargetDetails'
import SASjsChannel from './outputChannel'

export const setProcessVariables = async () => {
  process.outputChannel = SASjsChannel.getOutputChannel()
  await setProjectDirDetails()
  await setDefaultTargetDetails() // should be called after `setProjectDirDetails`. Otherwise process.isSasjsProject will be undefined
  await setConstants()
}
