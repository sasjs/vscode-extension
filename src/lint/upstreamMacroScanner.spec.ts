import { parseMacroCalls } from '@sasjs/lint'

/**
 * The scanning fix the extension takes with @sasjs/lint 5.5.7 (sasjs/lint
 * #319/#320): the argument of a masking function is text, not code, so an
 * invocation written inside `%bquote(...)` is not a call the file makes.
 *
 * Left unfixed, the scanner reported `%mf_inner` as an invocation of this file
 * - a name the file never invokes - which is how a lint pass invents a call and
 * how the `noUnusedMacros` side reports a macro as used. `%unquote` is the
 * exception and is still scanned as code, because it resolves its argument.
 *
 * `%bquote` itself is absent from the result on purpose: the released scanner
 * treats the masking functions as macro-language built-ins rather than calls a
 * file makes, so it skips the name along with the argument. That is asserted
 * here rather than left implicit, so a later version that starts reporting
 * `%bquote` shows up as a test failure instead of a silent behaviour change.
 */
describe('released macro scanner', () => {
  it('does not scan macro calls inside a bquote argument', () => {
    const text = '%put %bquote(%" %mf_inner()); %mf_after();'

    expect(parseMacroCalls(text).map((call) => call.name)).toEqual([
      'put',
      'mf_after'
    ])
  })

  it('scans the argument of %unquote, which resolves it', () => {
    const text = '%put %unquote(%mf_inner());'

    expect(parseMacroCalls(text).map((call) => call.name)).toEqual([
      'put',
      'unquote',
      'mf_inner'
    ])
  })
})
