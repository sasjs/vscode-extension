/**
 * Guards the grammar's comment rules against sasjs/vscode-extension#211.
 *
 * `*` opens a SAS statement comment only at the start of a statement, which the
 * grammar approximates as the start of a line. Inside PROC SQL that anchor is
 * wrong: a `select` / `*` / `from x` split over three lines is a wildcard, and
 * the comment rule used to swallow everything from the asterisk to the next
 * semicolon. The SQL block now uses `specialparser_sql`, which carries the macro
 * comment form (`%* text;`, resolved by the macro processor before the SQL parser
 * sees the statement) but not the bare asterisk.
 *
 * These tests tokenize real SAS with the shipped grammar, so an edit to
 * `specialparser`, `specialparser_sql` or the comment rules that reintroduces the
 * bug fails here rather than in someone's editor.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as oniguruma from 'vscode-oniguruma'
import * as vsctm from 'vscode-textmate'

const grammarPath = path.resolve(
  __dirname,
  '../../../syntaxes/sas.tmLanguage.json'
)

let grammar: vsctm.IGrammar

/**
 * Returns, for each line of `sas`, the text that carries a comment scope.
 */
const commentTextPerLine = (sas: string): string[] => {
  const lines = sas.split('\n')
  let ruleStack = vsctm.INITIAL

  return lines.map((line) => {
    const result = grammar.tokenizeLine(line, ruleStack)
    ruleStack = result.ruleStack

    return result.tokens
      .filter((token) =>
        token.scopes.some((scope) => scope.startsWith('comment'))
      )
      .map((token) => line.slice(token.startIndex, token.endIndex))
      .join('')
      .trim()
  })
}

const repository = (): Record<string, any> =>
  JSON.parse(fs.readFileSync(grammarPath, 'utf8')).repository

const includes = (entry: Record<string, any>): string[] =>
  (entry.patterns || [])
    .map((pattern: Record<string, any>) => pattern.include)
    .filter(Boolean)

beforeAll(async () => {
  const wasm = fs.readFileSync(
    require.resolve('vscode-oniguruma/release/onig.wasm')
  ).buffer

  const onigLib = oniguruma.loadWASM(wasm).then(() => ({
    createOnigScanner: (patterns: string[]) =>
      new oniguruma.OnigScanner(patterns),
    createOnigString: (s: string) => new oniguruma.OnigString(s),
  }))

  const registry = new vsctm.Registry({
    onigLib,
    loadGrammar: async () =>
      vsctm.parseRawGrammar(
        fs.readFileSync(grammarPath, 'utf8'),
        grammarPath
      ),
  })

  grammar = (await registry.loadGrammar('source.sas')) as vsctm.IGrammar
})

describe('SAS grammar comments', () => {
  it('does not read a wildcard on its own line in SQL as a comment', () => {
    const sas = `proc sql;
  create table xxx as select
  *
  from blah;
quit;`

    expect(commentTextPerLine(sas)).toEqual(['', '', '', '', ''])
  })

  it('does not read a wildcard in a multi-line SQL select as a comment', () => {
    const sas = `proc sql;
  select
    *
  from blah
  where x = 1;
quit;`

    expect(commentTextPerLine(sas)).toEqual(['', '', '', '', '', ''])
  })

  it('does not read a SQL wildcard as a comment on one line', () => {
    const sas = `proc sql;
  select * from sashelp.cars;
  select /* */ * from sashelp.class;
  select a.*, b.* from a,b;
quit;`

    // Only the deliberate block comment is a comment; every wildcard is not.
    expect(commentTextPerLine(sas)).toEqual(['', '', '/* */', '', ''])
  })

  it('still reads a macro comment inside SQL as a comment', () => {
    const sas = `proc sql;
  %* a macro comment;
  select * from x;
quit;`

    expect(commentTextPerLine(sas)).toEqual([
      '',
      '%* a macro comment;',
      '',
      '',
    ])
  })

  it('still reads a block comment whose continuation line starts with an asterisk', () => {
    const sas = `proc sql;
  /* a block comment
  * continued
  */
  select * from x;
quit;`

    const lines = commentTextPerLine(sas)

    expect(lines[1]).toBe('/* a block comment')
    expect(lines[2]).toBe('* continued')
    expect(lines[3]).toBe('*/')
    expect(lines[4]).toBe('')
  })

  it('still reads a comment statement in open code', () => {
    const sas = `* open code comment;
data want;
  set have;
run;`

    expect(commentTextPerLine(sas)[0]).toBe('* open code comment;')
  })

  it('still reads a comment statement inside a data step and a proc step', () => {
    const sas = `data want;
  * data step comment;
run;

proc print data=want;
  * proc body comment;
run;`

    const lines = commentTextPerLine(sas)

    expect(lines[1]).toBe('* data step comment;')
    expect(lines[5]).toBe('* proc body comment;')
  })

  it('keeps the bare asterisk rule out of the SQL block only', () => {
    const repo = repository()

    expect(includes(repo.sql)).toContain('#specialparser_sql')
    expect(includes(repo.sql)).not.toContain('#specialparser')

    expect(includes(repo.specialparser_sql)).toContain(
      '#macro_line_comment_string'
    )
    expect(includes(repo.specialparser_sql)).not.toContain(
      '#line_comment_string'
    )

    // The macro comment form is the one the SQL block keeps, so its pattern has
    // to require the `%` - widening it to `[\\s%]*\\*` reinstates the bug.
    expect(repo.macro_line_comment_string.begin).toBe('(^[\\s]*%+\\*)')

    // Every other block still gets the bare asterisk rule.
    expect(includes(repo.specialparser)).toContain('#line_comment_string')
    expect(includes(repo.procstep)).toContain('#specialparser')
    expect(includes(repo.datastep)).toContain('#specialparser')
    expect(repo.line_comment_string.begin).toBe('(^[\\s%]*\\*)')
  })
})
