import { window } from 'vscode'
import * as validUrl from 'valid-url'
import { ServerType } from '@sasjs/utils/types'

export const getTargetName = async () => {
  const targetName = await getTextInput(
    'Please enter a name for your target',
    (value: string) => (value ? null : 'Target name can not be empty')
  )

  return targetName
}

export const getTarget = async () => {
  const targetName = await getTextInput(
    'Please enter a name for your target',
    (value: string) => (value ? null : 'Target name can not be empty')
  )

  return targetName
}

export const getServerUrl = async () => {
  const serverUrl = await getTextInput(
    'Please enter your SAS server URL',
    (value: string) => {
      if (validUrl.isHttpUri(value) || validUrl.isHttpsUri(value)) {
        return null
      }
      return 'Server URL is not valid'
    }
  )

  return serverUrl
}

export const getServerType = async () => {
  const serverType = await getChoiceInput(
    ['SAS Viya'],
    'Please select a SAS server type'
  )

  return serverType === 'SAS Viya' ? ServerType.SasViya : ServerType.Sas9
}

export const getClientId = async () => {
  const clientId = await getTextInput(
    'Please enter your Client ID',
    (value: string) => (value ? null : 'Client ID can not be empty')
  )

  return clientId
}

export const getClientSecret = async () => {
  const clientId = await getTextInput(
    'Please enter your Client Secret',
    (value: string) => (value ? null : 'Client Secret can not be empty')
  )

  return clientId
}

export const getAuthCode = async () => {
  const authCode = await getTextInput(
    'Please enter your authorization code',
    (value: string) => (value ? null : 'Authorization code can not be empty')
  )

  return authCode
}

export const getTextInput = async (
  placeHolder: string,
  validator: (value: string) => string | null
) => {
  const input = await window.showInputBox({
    placeHolder,
    ignoreFocusOut: true,
    validateInput: validator
  })

  if (!input) {
    throw new Error('Input is invalid.')
  }

  return input
}

export const getChoiceInput = async (
  choices: string[],
  placeHolder: string
) => {
  const input = await window.showQuickPick(choices, {
    placeHolder,
    ignoreFocusOut: true
  })

  return input
}

export const getIsDefault = async () => {
  const isDefault = await window.showQuickPick(['Yes', 'No'], {
    placeHolder: 'Would you like to set this as the default target?',
    ignoreFocusOut: true
  })

  return isDefault === 'Yes'
}
