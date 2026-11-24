#!/usr/bin/env node
// Every snippet contribution the extension declares has to be in the package.
//
// A contribution whose path is missing does not fail the build: VS Code simply
// has no snippets from that path, and the shipped manifest keeps advertising a
// file that was never included. That is how `./snippets/function-snippets.json`
// went out in 3.3.0 - the upstream directory stopped carrying it, `degit` fetched
// what was there, and nothing compared the two.
//
// The snippets are fetched at setup time from an unpinned upstream directory, so
// this check belongs immediately after the fetch (pull request and release) and
// not in a lint pass that runs before it.
import { readFileSync, statSync, readdirSync } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

export function checkSnippets ({ pkg, root }) {
  const problems = []
  const contributions = pkg?.contributes?.snippets
  if (!Array.isArray(contributions) || contributions.length === 0) {
    // A vacuous pass is how this class of bug survives: fail loudly instead.
    return ['package.json declares no snippet contributions, so there is nothing to check']
  }
  for (const [index, entry] of contributions.entries()) {
    const declared = entry && typeof entry === 'object' ? entry.path : undefined
    if (typeof declared !== 'string' || declared.trim() === '') {
      problems.push(`snippet contribution ${index} has no path`)
      continue
    }
    if (isAbsolute(declared)) {
      problems.push(`snippet contribution ${index} uses an absolute path: ${declared}`)
      continue
    }
    const full = resolve(root, declared)
    const inside = relative(root, full)
    if (inside.startsWith('..') || isAbsolute(inside)) {
      problems.push(`snippet contribution ${index} escapes the package: ${declared}`)
      continue
    }
    let stat
    try {
      stat = statSync(full)
    } catch (error) {
      problems.push(`snippet contribution ${index} points at a file that is not in the package: ${declared}`)
      continue
    }
    if (!stat.isFile()) {
      problems.push(`snippet contribution ${index} points at something that is not a file: ${declared}`)
      continue
    }
    let parsed
    try {
      parsed = JSON.parse(readFileSync(full, 'utf8'))
    } catch (error) {
      problems.push(`snippet contribution ${index} is not valid JSON (${declared}): ${error.message}`)
      continue
    }
    // VS Code accepts both spellings: an array of snippets, or an object keyed by
    // snippet name (which is what upstream's proc-snippets.json uses).
    const entries = Array.isArray(parsed)
      ? parsed.map((snippet, position) => [null, snippet, position])
      : parsed && typeof parsed === 'object'
        ? Object.entries(parsed).map(([key, snippet]) => [key, snippet])
        : null
    if (!entries || entries.length === 0) {
      problems.push(`snippet contribution ${index} is not a non-empty array or object of snippets: ${declared}`)
      continue
    }
    const badBody = snippet => {
      const body = snippet && snippet.body
      if (typeof body === 'string') return body === ''
      if (Array.isArray(body)) return body.length === 0 || body.some(line => typeof line !== 'string')
      return true
    }
    const broken = entries.find(([key, snippet]) => !snippet || typeof snippet !== 'object' ||
      badBody(snippet) ||
      (key === null && snippet.prefix === undefined && snippet.name === undefined))
    if (broken) {
      const label = broken[0] ?? broken[2]
      problems.push(`snippet contribution ${index} entry ${label} has no body, or no prefix/name: ${declared}`)
    }
  }
  return problems
}

// A declared path that is present but unreferenced is not an error; a directory
// that was fetched and left empty is worth saying out loud, because it usually
// means the upstream fetch produced nothing.
export function report (problems) {
  for (const problem of problems) console.error(`::error::${problem}`)
  return problems.length === 0
}

// `vsce ls` writes the files the package would contain, one per line, relative
// to the extension root. Checking the listing is the stronger claim the issue
// asked for: it is the packaging rules (.vscodeignore) that decide, and a
// contribution can point at a file that exists in the workspace and is still
// excluded from the package.
export function checkListing ({ pkg, listing }) {
  const problems = []
  const files = new Set(listing.split('\n').map(line => line.trim().replace(/^\.\//, '')).filter(Boolean))
  const contributions = Array.isArray(pkg?.contributes?.snippets) ? pkg.contributes.snippets : []
  if (contributions.length === 0) return ['package.json declares no snippet contributions, so there is nothing to check']
  for (const [index, entry] of contributions.entries()) {
    const declared = entry && typeof entry.path === 'string' ? entry.path.replace(/^\.\//, '') : null
    if (!declared) {
      problems.push(`snippet contribution ${index} has no path`)
      continue
    }
    if (!files.has(declared)) {
      problems.push(`snippet contribution ${index} is not in the package listing: ${declared}`)
    }
  }
  return problems
}

function main () {
  const root = process.cwd()
  const vsixList = process.argv.indexOf('--vsix-list')
  let pkg
  try {
    pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  } catch (error) {
    console.error(`::error::cannot read package.json: ${error.message}`)
    process.exit(1)
  }
  if (vsixList !== -1) {
    const listingPath = process.argv[vsixList + 1]
    if (!listingPath) {
      console.error('::error::--vsix-list needs a file of packaged paths')
      process.exit(2)
    }
    let listing
    try {
      listing = readFileSync(listingPath, 'utf8')
    } catch (error) {
      console.error(`::error::cannot read the package listing ${listingPath}: ${error.message}`)
      process.exit(1)
    }
    const listingProblems = checkListing({ pkg, listing })
    if (!report(listingProblems)) {
      console.error('::error::the package would not contain a file its manifest advertises')
      process.exit(1)
    }
    console.log(`every declared snippet contribution is in ${listingPath}`)
    return
  }
  const problems = checkSnippets({ pkg, root })
  if (!report(problems)) {
    console.error('::error::the packaged extension would advertise snippet files it does not contain')
    process.exit(1)
  }
  const snippets = resolve(root, 'snippets')
  try {
    const files = readdirSync(snippets).filter(name => name.endsWith('.json'))
    console.log(`snippet contributions check out; ${files.length} file(s) under snippets/: ${files.join(', ') || '(none)'}`)
  } catch (error) {
    console.log('snippet contributions check out')
  }
}

function invokedDirectly () {
  try {
    return resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] || '')
  } catch (error) {
    return true
  }
}

if (invokedDirectly()) main()
