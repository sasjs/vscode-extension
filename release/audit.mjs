#!/usr/bin/env node
/**
 * A strict audit of the RELEASE TOOLCHAIN in release/.
 *
 * Kept separate from the package's own `npm audit` on purpose. The toolchain is
 * not shipped, so its advisories should not gate the package - but it runs in CI
 * with publish credentials, so it must not be invisible either. This reports it
 * in its own scope, by name.
 *
 * Anything not listed in EXEMPT fails the build, and so does an exemption that
 * stops appearing: the list is a claim about the locked tree, and a claim that
 * no longer holds is deleted rather than left to rot. Both are failures because
 * a stale entry is invisible in a passing build, and a list that only warns
 * drifts out of step with the tree it describes.
 *
 * The list has four entries, all of them code vendored inside npm 11.21.1 or
 * inside a package the publish path resolves: one ip-address advisory and two
 * undici ones in npm's bundled tree, and one msal-node advisory under
 * @azure/identity. brace-expansion, http-cache-semantics and
 * postcss-selector-parser are fixed in that npm and do not appear.
 *
 * Each entry names the path it covers, and an advisory is exempt only when every
 * reported instance sits on that path. Keying on the GHSA id alone would let an
 * in-range copy arriving through a repo-owned dependency pass under an argument
 * written about npm's bundled one.
 *
 * Every exemption carries its own argument - where the affected code sits,
 * whether this repo's release path runs it, and whose input reaches it. An
 * advisory whose input arrives from outside this repo is a risk acceptance
 * rather than a non-issue, and its entry says so rather than claiming
 * unreachability.
 *
 * Uses --package-lock-only, so it needs no install and runs cheaply on a PR.
 *
 * The same script ships in adapter, cli, sas-language, utils and
 * vscode-extension. EXEMPT describes the tree it sits in, so each repo carries
 * its own list: a lockfile bump that clears an entry in one has to land in the
 * others before theirs can shrink.
 *
 * Run with `node release/audit.mjs`.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const releaseDir = dirname(fileURLToPath(import.meta.url))

/**
 * Advisories in the release toolchain that cannot be fixed from this repo, and why.
 */
const EXEMPT = new Map([
  [
    'GHSA-rxp7-6hxx-x8q5',
    {
      paths: ['node_modules/npm/node_modules/ip-address'],
      reason:
        'ip-address 10.7.2, bundled inside npm 11.21.1, which @semantic-release/npm resolves from its npm ^11.6.2 range. 11.21.1 is the newest 11.x, and the version npm bundles cannot be overridden from here - adding `overrides` for ip-address to release/package.json leaves the lockfile at 10.7.2, which was measured. RISK ACCEPTANCE, not unreachability: the parse runs only on a proxy address that carries an Address6 zone identifier; the exposure is a stall during publish, and that string can arrive from standard npm proxy configuration (`npm_config_proxy`, `HTTPS_PROXY`), so the input path is reachable and the accepted risk is a publish-time stall rather than a package-supplied one. No bump in this repo moves it: forcing npm 12.2.1 inside the toolchain was measured too, and its own bundled tree still vendors ip-address 10.7.2. It clears only when npm ships ip-address >= 10.7.4 in its own bundled tree; the advisory then disappears and this entry fails the gate until it is deleted.'
    }
  ],
  [
    'GHSA-4qv8-2p9j-2685',
    {
      paths: ['node_modules/npm/node_modules/undici'],
      reason:
        "undici 6.29.0, bundled inside npm 11.21.1 and reached through @semantic-release/npm's npm ^11.6.2 range. The advisory range is >=6.5.0 <6.29.1, and the two copies this repo can see are outside it - node_modules/undici 7.30.1 and the 6.29.1 under @actions/http-client - so what fails here is npm's own vendored copy. No `overrides` entry reaches a dependency vendored inside npm's tarball; that was measured for ip-address above, and forcing npm 12 inside the toolchain does not help. RISK ACCEPTANCE: this parser runs inside npm's own network operations during the publish step, on responses from the registry over TLS, so the input path is reachable and the exposure is a stall during publish. It clears when npm ships undici >= 6.29.1 in its bundle, and this entry then fails the gate until it is deleted."
    }
  ],
  [
    'GHSA-xjj6-f33q-929c',
    {
      paths: ['node_modules/npm/node_modules/undici'],
      reason:
        'Same undici 6.29.0 bundled inside npm 11.21.1 (range >=6.23.0 <6.29.1), same reasoning as GHSA-4qv8-2p9j-2685: the copies this repo resolves are 7.30.1 and 6.29.1, both outside the affected range, and the vendored one cannot be overridden. RISK ACCEPTANCE, exposure is a publish-time stall.'
    }
  ],
  [
    'GHSA-xcx6-jx8p-x3h5',
    {
      paths: ['node_modules/@azure/msal-node'],
      reason:
        'msal-node 6.0.1, resolved by @azure/identity ^4.1.0 (through @vscode/vsce) which requires @azure/msal-node ^6.0.0. The advisory range is >=5.0.0-beta.0 <7.1.0 and 6.0.1 is the newest 6.x, so no in-range bump exists; @azure/identity has no 5.x, so lifting it does not move msal either. Forcing msal-node 7 through `overrides` would be a major version change in the publish authentication path, which is the higher risk here. RISK ACCEPTANCE, not unreachability: the advisory concerns the authorization-code flow (browser sign-in), and this repo publishes to Open VSX with OVSX_PAT and packages with vsce, neither of which runs that flow - the VS Marketplace credential is commented out in publish.yml. It clears when @azure/identity moves to msal-node >= 7.1.0.'
    }
  ]
])

/**
 * An advisory is exempt only when every instance npm reported sits on one of the
 * paths its entry names. A copy of the same package reached through a repo-owned
 * dependency lands on a different path, so it fails rather than inheriting an
 * argument written about npm's bundled copy.
 */
export const exemptionCovers = (entry, exemptions) => {
  const rule = exemptions.get(entry.id)

  if (!rule) return false

  if (!entry.nodes?.size) return false

  return [...entry.nodes].every((node) => rule.paths.includes(node))
}

const run = () => {
  // A report can be supplied directly, which is how the gate is tested: the
  // matcher decides whether an exemption applies, and that decision has to be
  // exercised against reports whose shape is chosen rather than ambient.
  if (process.env.AUDIT_REPORT_FILE)
    return readFileSync(process.env.AUDIT_REPORT_FILE, 'utf8')

  try {
    return execFileSync(
      'npm',
      ['audit', '--package-lock-only', '--json', '--prefix', releaseDir],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    )
  } catch (error) {
    // npm audit exits non-zero when it finds anything, which is the case we are
    // here to read, so the report on stdout is the payload either way.
    if (error.stdout) return error.stdout
    throw error
  }
}

/**
 * The gate itself, behind a function so this module can be imported: the matcher
 * above is the part worth testing, and an import that runs npm audit and exits
 * would test nothing.
 */
const gate = () => {
  let report
  try {
    report = JSON.parse(run())
  } catch {
    console.error('could not read the npm audit report for release/')
    process.exit(1)
  }

  const ghsaOf = (via) => {
    if (typeof via === 'string') return undefined
    const match = /GHSA-[a-z0-9-]+/i.exec(via?.url ?? '')
    return match ? match[0] : undefined
  }

  const found = new Map()
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      const id = ghsaOf(via)
      if (!id) continue
      if (!found.has(id)) {
        found.set(id, {
          id,
          title: via.title ?? '',
          severity: via.severity ?? vulnerability.severity,
          packages: new Set(),
          nodes: new Set()
        })
      }
      found.get(id).packages.add(vulnerability.name)
      for (const node of vulnerability.nodes ?? [])
        found.get(id).nodes.add(node)
    }
  }

  const exempt = [...found.values()].filter((entry) =>
    exemptionCovers(entry, EXEMPT)
  )
  const failing = [...found.values()].filter(
    (entry) => !exemptionCovers(entry, EXEMPT)
  )

  console.log(`release toolchain: ${found.size} advisory(s)`)
  for (const entry of found.values()) {
    const mark = exemptionCovers(entry, EXEMPT) ? 'exempt' : 'FAIL  '
    console.log(
      `  ${mark} ${entry.severity.padEnd(8)} ${entry.id}  ${[
        ...entry.packages
      ].join(', ')}`
    )
    console.log(`         ${entry.title}`)
    for (const node of entry.nodes) console.log(`         at ${node}`)
  }

  // An exemption that is no longer needed should be deleted, not left to rot.
  // Aggregated with the failing gate, so an unexempted advisory is never masked
  // by a stale-exemption report (or vice versa).
  const stale = [...EXEMPT.keys()].filter((id) => !found.has(id))

  if (failing.length) {
    console.error(
      `\n${failing.length} advisory(s) in the release toolchain outside the documented exemptions:`
    )
    for (const entry of failing) {
      const why = EXEMPT.has(entry.id)
        ? `exempt only at ${EXEMPT.get(entry.id).paths.join(
            ' or '
          )}, found at ${[...entry.nodes].join(', ') || 'an unrecorded path'}`
        : 'not exempt'
      console.error(`  ${entry.severity} ${entry.id}  ${entry.title}  (${why})`)
    }
    console.error(
      '\nThe toolchain is not shipped, but it runs with publish credentials. Fix it,\n' +
        'or add it to EXEMPT in release/audit.mjs with the reason it cannot be fixed.'
    )
  }

  if (stale.length) {
    console.error(
      '\nexempt advisories that no longer appear, so the exemption can go:'
    )
    for (const id of stale)
      console.error(`  ${id}  (exempt at ${EXEMPT.get(id).paths.join(', ')})`)
  }

  if (failing.length || stale.length) process.exit(1)

  console.log(
    `\nno advisory in the release toolchain outside the documented exemptions` +
      (exempt.length ? ` (${exempt.length} exempt)` : '')
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  gate()
