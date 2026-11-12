import { window } from 'vscode'

let lastMessage: string | undefined

/**
 * Shows a lint-configuration error once per distinct message.
 *
 * Linting runs on every change, so an unreadable `.sasjslint` would otherwise
 * raise a notification per keystroke. The message names the file and changes
 * only when the file does, so one notification per edit of the file is the
 * rate - and the first one still arrives immediately, which is the point.
 */
export const reportLintConfigError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)

  if (message === lastMessage) {
    return
  }

  lastMessage = message
  window.showErrorMessage(message)
}

/** Called once a configuration loads, so a fixed file reports again if it breaks. */
export const clearLintConfigError = () => {
  lastMessage = undefined
}
