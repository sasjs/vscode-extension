import { window } from 'vscode'

import { updateSasjsConstants } from '../../utils/setConstants'
import { selectTarget } from '../../utils/target'
import { handleErrorResponse } from '../../utils/utils'

export class TargetCommand {
  protected getTargetInfo = async () =>
    await selectTarget()
      .then((res) => {
        if (res.target) {
          updateSasjsConstants(res.target, res.isLocal)
        }
        return res
      })
      .catch((err) => {
        handleErrorResponse(err, 'Error selecting target:')

        window.showErrorMessage(
          'An unexpected error occurred while selecting target.'
        )

        return { target: undefined, isLocal: false }
      })
}
