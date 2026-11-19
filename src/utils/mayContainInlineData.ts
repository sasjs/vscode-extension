// Deliberately conservative: formatting rules can alter data records, and the
// linter's data-section scanner does not recognise every SAS spelling. This may
// also match ordinary prose or identifiers until the linter protects records.
export const mayContainInlineData = (text: string): boolean =>
  /datalines|parmcards|cards|lines/i.test(text)
