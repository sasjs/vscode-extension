import { OutputChannel, env, Uri } from 'vscode'
import axios from 'axios'

import SASjs from '@sasjs/adapter/node'
import { encodeToBase64 } from '@sasjs/utils'
import { Target, ServerType } from '@sasjs/utils/types'
import {
  getAuthCode,
  getClientId,
  getClientSecret,
  getServerType,
  getServerUrl,
  getTargetName,
  getUserName,
  getPassword
} from './input'
import { getAuthUrl, getTokens, authenticateTarget } from './auth'
import { saveToGlobalConfig } from './config'

export const createTarget = async (outputChannel: OutputChannel) => {
  const name = await getTargetName()
  const serverUrl = await getServerUrl()
  const serverType = await getServerType()
  const targetJson: any = {
    name,
    serverUrl,
    serverType,
    appLoc: '/Public/app'
  }

  await authenticateTarget(targetJson, outputChannel)

  const target = new Target(targetJson)

  await saveToGlobalConfig(target, outputChannel)

  return target
}
