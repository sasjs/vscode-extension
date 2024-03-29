import { window, QuickPickItem } from 'vscode'
import { URL } from 'url'
import { ServerType } from '@sasjs/utils/types'
import { validateServerUrl } from '@sasjs/utils/types/targetValidators'

export const getTargetName = async () => {
  const targetName = await getTextInput(
    'Please enter a name for your target',
    (value: string) => {
      if (!value) {
        return 'Target name can not be empty'
      }

      if (!/^[A-Za-z0-9\-]+$/.test(value)) {
        return 'Target name should be alphanumeric or can contain dashes'
      }

      return null
    }
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

const serverUrlPlaceholder = 'Please enter your SAS server URL'
export const getServerUrl = async () => {
  const defaultValue = 'https://'

  const serverUrl = await getTextInput(
    serverUrlPlaceholder,
    (value: string) => {
      try {
        validateServerUrl(value)
      } catch (err) {
        return err as string
      }

      return null
    },
    false,
    defaultValue
  )

  if (serverUrl === '') {
    return serverUrl
  }

  const url = new URL(serverUrl)

  return `${url.protocol}//${url.host}`
}

export const getServerType = async () => {
  const serverType = await getChoiceInput(
    [ServerType.SasViya, ServerType.Sas9, ServerType.Sasjs],
    'Please select a SAS server type'
  )

  if (typeof serverType === 'string') {
    return serverType as ServerType
  }

  return serverType
}

export const getClientId = async (defaultClientID?: string) => {
  const clientId = await getTextInput(
    'Please enter your Client ID',
    (value: string) => (value ? null : 'Client ID can not be empty'),
    false,
    defaultClientID
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

export const getUserName = async () => {
  const authCode = await getTextInput('Enter UserName', (value: string) =>
    value ? null : 'UserName can not be empty'
  )

  return authCode
}

export const getPassword = async () => {
  const authCode = await getTextInput(
    'Enter Password',
    (value: string) => (value ? null : 'Password can not be empty'),
    true
  )

  return authCode
}

export const getTextInput = async (
  placeHolder: string,
  validator: (value: string) => string | null,
  password: boolean = false,
  value?: string
) => {
  const input = await window.showInputBox({
    value,
    placeHolder,
    ignoreFocusOut: true,
    password,
    validateInput: validator
  })

  if (!input) {
    if (placeHolder !== serverUrlPlaceholder) {
      throw new Error('Input is invalid.')
    }
  }

  return input as string
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

export const getTargetChoice = async (
  choices: QuickPickItem[],
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

export const getCreateNewTarget = async () => {
  const createNew = await window.showQuickPick(['Yes', 'No'], {
    placeHolder: 'No targets are found. Would you like to create a new target?',
    ignoreFocusOut: true
  })
  return createNew === 'Yes'
}
