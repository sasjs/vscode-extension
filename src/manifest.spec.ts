import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The extension's activation contract.
 *
 * `activationEvents: ["*"]` asks VS Code to start the extension in every window,
 * as early as possible, and VS Code reports it as a performance problem:
 *
 *   Using '*' activation is usually a bad idea as it impacts performance.
 *
 * The extension does need to run when a window opens - it sets the
 * `isWorkspaceOpened` context key that every menu entry is gated on, starts the
 * SAS language server and creates the target indicator - so the replacement is
 * `onStartupFinished`, which starts it once the window is up rather than making
 * the window wait for it. Removing activation events altogether would leave the
 * menus hidden and the indicator missing until a SAS file happened to be opened,
 * which is a behaviour change rather than a fix.
 *
 * This spec is here because the manifest is not otherwise read by any test: a
 * future edit could reintroduce `*` and nothing in CI would notice.
 */
const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
)

const versionAtLeast = (version: string, floor: string): boolean => {
  const parse = (value: string) =>
    value
      .replace(/^[^\d]*/, '')
      .split('.')
      .map((part) => parseInt(part, 10) || 0)

  const [a, b, c] = parse(version)
  const [x, y, z] = parse(floor)

  return a > x || (a === x && (b > y || (b === y && c >= z)))
}

describe('package.json activation', () => {
  it('does not ask to be activated on every event', () => {
    expect(manifest.activationEvents).not.toContain('*')
  })

  it('activates once the window has started, which is what the menus need', () => {
    expect(manifest.activationEvents).toContain('onStartupFinished')
  })

  it('declares a VS Code version that supports onStartupFinished', () => {
    // added in 1.57, and implicit activation of contributed commands and
    // languages - the alternative to listing events by hand - arrived in 1.74
    expect(versionAtLeast(manifest.engines.vscode, '1.74')).toBe(true)
  })

  it('keeps every contributed command reachable without a startup event', () => {
    // a command that is not registered by activate() needs its own
    // onCommand: activation event, and none of ours do
    const commands = manifest.contributes.commands.map(
      (entry: any) => entry.command
    )

    expect(commands.length).toBeGreaterThan(0)
    expect(
      manifest.activationEvents.filter((event: string) =>
        event.startsWith('onCommand:')
      )
    ).toEqual([])
  })
})
