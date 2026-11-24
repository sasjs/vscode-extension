const { readFileSync } = require('node:fs')

function checkCoverage (summary) {
  const files = Object.keys(summary).filter(key => key !== 'total').map(key => key.replaceAll('\\', '/'))
  const problems = []
  if (files.some(file => /(?:^|\/)src\/test\//.test(file))) problems.push('coverage includes editor-host tests')
  if (!files.some(file => /(?:^|\/)src\/languageServer\/languageServer\.ts$/.test(file))) problems.push('coverage is missing production language server code')
  return problems
}

module.exports = { checkCoverage }

if (require.main === module) {
  try {
    const summary = JSON.parse(readFileSync(process.argv[2] || 'coverage/coverage-summary.json', 'utf8'))
    const problems = checkCoverage(summary)
    if (problems.length) throw new Error(problems.join('; '))
    console.log('coverage includes production code and excludes editor-host tests')
  } catch (error) {
    console.error(`::error::${error.message}`)
    process.exitCode = 1
  }
}
