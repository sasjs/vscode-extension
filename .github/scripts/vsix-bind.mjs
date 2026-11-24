#!/usr/bin/env node
// Binds a downloaded VSIX artifact to this workflow run, before it is attested.
//
// Two questions are answered here, and both fail closed:
//
//   1. Is the file on disk the artifact this run's build job uploaded? Checked
//      against the artifact API's own record (id, digest, run id, head sha) and
//      against the digest the build job reported, not against the artifact name,
//      which is producer-controlled.
//   2. May this attempt create a new attestation at all? Only the first attempt
//      may sign. GitHub re-runs reuse the outputs of jobs that were not re-run
//      while incrementing the attempt, and the attempt API lists those inherited
//      jobs with fresh numbers, so no supported call proves which attempt
//      produced a given artifact. A later attempt therefore may not claim the
//      bytes were built now; it may only reuse an attestation already recorded
//      for exactly these bytes, and must stop if there is none.
import { createHash } from 'node:crypto'
import { readFileSync, statSync, appendFileSync } from 'node:fs'

export const SIGN = 'sign'
export const REUSE = 'reuse'

const SHA256 = /^[0-9a-f]{64}$/
const sha256Prefixed = /^sha256:[0-9a-f]{64}$/

export function digestOf (path) {
  const stat = statSync(path)
  if (!stat.isFile()) throw new Error(`${path} is not a file`)
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function evaluate ({
  artifact,
  artifactId,
  expectedDigest,
  actualDigest,
  runId,
  runAttempt,
  sha
}) {
  const problems = []
  const check = (name, actual, expected) => {
    if (String(actual) !== String(expected)) {
      problems.push(`${name}: expected ${expected}, got ${actual === undefined || actual === null ? 'missing' : JSON.stringify(actual)}`)
    }
  }

  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return { mode: null, problems: ['artifact metadata is not a JSON object'] }
  }
  if (!SHA256.test(String(actualDigest))) {
    problems.push(`downloaded file digest is not a sha256 hex string: ${JSON.stringify(actualDigest)}`)
  }
  if (!Number.isInteger(runAttempt) || runAttempt < 1) {
    problems.push(`run attempt is not a positive integer: ${JSON.stringify(runAttempt)}`)
  }

  check('artifact id', artifact.id, artifactId)
  if (artifact.expired !== false) {
    problems.push(`artifact expired flag is ${JSON.stringify(artifact.expired)}, not false`)
  }
  const run = artifact.workflow_run
  if (!run || typeof run !== 'object') {
    problems.push('artifact metadata has no workflow_run, so it cannot be tied to this run')
  } else {
    check('artifact workflow_run.id', run.id, runId)
    check('artifact workflow_run.head_sha', run.head_sha, sha)
  }
  if (!sha256Prefixed.test(String(artifact.digest))) {
    problems.push(`artifact digest is not sha256:<hex>: ${JSON.stringify(artifact.digest)}`)
  } else {
    check('artifact digest', artifact.digest, `sha256:${actualDigest}`)
  }

  // The build job's own report only means anything in the attempt that built it.
  // On a re-run the outputs can be an inherited attempt's, so they are not
  // compared: the API digest above is the binding that survives.
  if (runAttempt === 1 && !SHA256.test(String(expectedDigest))) {
    problems.push(`build job did not report a sha256 digest: ${JSON.stringify(expectedDigest)}`)
  } else if (runAttempt === 1) {
    check('build job digest', expectedDigest, actualDigest)
  }

  if (problems.length) return { mode: null, problems }
  return { mode: runAttempt === 1 ? SIGN : REUSE, problems: [] }
}

function main () {
  const [metadataPath, vsixPath] = process.argv.slice(2)
  if (!metadataPath || !vsixPath) {
    console.error('usage: vsix-bind.mjs <artifact-metadata.json> <vsix>')
    process.exit(2)
  }
  const artifact = JSON.parse(readFileSync(metadataPath, 'utf8'))
  const { mode, problems } = evaluate({
    artifact,
    artifactId: process.env.ARTIFACT_ID,
    expectedDigest: process.env.EXPECTED_DIGEST,
    actualDigest: digestOf(vsixPath),
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    sha: process.env.GITHUB_SHA
  })
  if (!mode) {
    for (const problem of problems) console.error(`::error::${problem}`)
    console.error('::error::the VSIX cannot be bound to this run, so it will not be attested')
    process.exit(1)
  }
  console.log(`bound ${vsixPath} to run ${process.env.GITHUB_RUN_ID} attempt ${process.env.GITHUB_RUN_ATTEMPT}: ${mode}`)
  if (mode === REUSE) {
    console.log('::warning::this attempt rebuilt the VSIX; it may only reuse an attestation already recorded for these bytes')
  }
  // Written to the file directly: stdout also carries the human-readable line
  // above, so redirecting stdout into $GITHUB_OUTPUT would corrupt the output.
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
