#!/usr/bin/env node
// Selects the one previously recorded attestation a re-run may reuse.
//
// A later attempt of this workflow cannot sign (see vsix-bind.mjs): the bytes it
// downloaded may be an inherited attempt's. It can still finish the release if
// an attestation for exactly these bytes already exists, so this reads the output
// of `gh attestation verify --format json` - which has already checked every
// bundle against the repository, signer workflow, source digest and ref - and
// writes that bundle out.
//
// Two or more *distinct* verified bundles is not a choice the workflow is allowed
// to make: picking one by response order would attach an attestation nobody
// chose. That fails closed and needs a human.
import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Key order is not part of a bundle's meaning, so two spellings of the same
// bundle must collapse rather than look like two different attestations.
export function canonical (value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function selectBundle (input) {
  const list = Array.isArray(input)
    ? input
    : input && typeof input === 'object' && Array.isArray(input.attestations)
      ? input.attestations
      : null
  if (!list) throw new Error('attestation output is not a list of attestations')
  if (list.length === 0) {
    throw new Error('no verified attestation covers these bytes in this repository; resolve manually')
  }
  const lines = list.map((entry, index) => {
    const bundle = entry && typeof entry === 'object'
      ? (entry.attestation && entry.attestation.bundle) ?? entry.bundle
      : undefined
    if (bundle === undefined || bundle === null) {
      throw new Error(`attestation ${index} carries no bundle`)
    }
    let parsed = bundle
    if (typeof bundle === 'string') {
      try {
        parsed = JSON.parse(bundle)
      } catch (error) {
        throw new Error(`attestation ${index} bundle is not JSON: ${error.message}`)
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`attestation ${index} bundle is not a JSON object`)
    }
    // Any object would satisfy `test -s`, so require the shape `gh` returns;
    // the cryptographic check downstream is the real one, but this keeps an empty
    // or unrelated object from being carried around as a "bundle".
    if (!parsed.dsseEnvelope || typeof parsed.dsseEnvelope !== 'object' || Array.isArray(parsed.dsseEnvelope)) {
      throw new Error(`attestation ${index} bundle has no dsseEnvelope, so it is not an attestation bundle`)
    }
    return canonical(parsed)
  })
  // `lines` is already canonical, so equality here is structural.
  const distinct = [...new Set(lines)]
  if (distinct.length > 1) {
    throw new Error(`${distinct.length} distinct verified attestations cover these bytes; resolve manually rather than picking one`)
  }
  return distinct[0]
}

function main () {
  const [inputPath, outputPath] = process.argv.slice(2)
  if (!inputPath || !outputPath) {
    console.error('usage: select-attestation-bundle.mjs <attestations.json> <bundle.out>')
    process.exit(2)
  }
  let line
  try {
    line = selectBundle(JSON.parse(readFileSync(inputPath, 'utf8')))
  } catch (error) {
    console.error(`::error::${error.message}`)
    process.exit(1)
  }
  // One JSONL line: the bundle file format the release assets and the OpenSSF
  // scorecard both read.
  writeFileSync(outputPath, `${line}\n`)
  console.log(`reusing the recorded attestation: ${outputPath} (${line.length} bytes)`)
}

// Comparing import.meta.url to a hand-built file URL skips main() when the script
// is invoked through a symlink, which would exit 0 having done nothing. Compare
// real paths instead, and on any doubt run main.
function invokedDirectly () {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch (error) {
    return true
  }
}

if (invokedDirectly()) main()
