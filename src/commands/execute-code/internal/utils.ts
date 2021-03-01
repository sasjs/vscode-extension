import { timestampToYYYYMMDDHHMMSS } from '@sasjs/utils/time'

export const getTimestamp = () =>
  timestampToYYYYMMDDHHMMSS()
    .replace(/ /g, '')
    .replace(/\//g, '')
    .replace(/:/g, '')
