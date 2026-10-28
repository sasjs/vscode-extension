import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * The gate decides whether an exemption applies, and that decision is the
 * property the path-keyed entry model exists to keep: an exemption argues for a
 * location, not for a package name anywhere in the tree. A change back to
 * matching on the advisory id alone would otherwise pass CI silently.
 *
 * The report is supplied through AUDIT_REPORT_FILE, so the cases are chosen
 * rather than dependent on what the locked tree happens to contain today.
 */
const script = join(__dirname, 'audit.mjs')
const dir = mkdtempSync(join(tmpdir(), 'audit-spec-'))

afterAll(() => rmSync(dir, { recursive: true, force: true }))

let written = 0

// npm reports one entry per package, with every advisory for it under `via`, so
// the fixture groups the same way
const report = (
  advisories: { id: string; package: string; nodes: string[] }[]
) => {
  const vulnerabilities: Record<string, any> = {}

  for (const advisory of advisories) {
    const entry = (vulnerabilities[advisory.package] ??= {
      name: advisory.package,
      severity: 'high',
      nodes: advisory.nodes,
      via: []
    })

    entry.via.push({
      url: `https://github.com/advisories/${advisory.id}`,
      title: 'test advisory',
      severity: 'high'
    })
  }

  return { vulnerabilities }
}

const run = (advisories: Parameters<typeof report>[0]) => {
  const file = join(dir, `report-${written++}.json`)
  writeFileSync(file, JSON.stringify(report(advisories)))

  return spawnSync('node', [script], {
    encoding: 'utf8',
    env: { ...process.env, AUDIT_REPORT_FILE: file }
  })
}

const VENDORED = 'node_modules/npm/node_modules/undici'

describe('release audit exemptions', () => {
  it('should pass when every advisory sits at the path its entry names', () => {
    // every entry covered, so the gate is green: this is the tree the
    // exemptions describe
    const result = run([
      { id: 'GHSA-2m5v-pch6-74hx', package: 'undici', nodes: [VENDORED] },
      { id: 'GHSA-qrxm-fqhp-jwvm', package: 'undici', nodes: [VENDORED] },
      { id: 'GHSA-9fm3-97px-rjf6', package: 'undici', nodes: [VENDORED] },
      { id: 'GHSA-4qv8-2p9j-2685', package: 'undici', nodes: [VENDORED] },
      { id: 'GHSA-xjj6-f33q-929c', package: 'undici', nodes: [VENDORED] },
      {
        id: 'GHSA-rxp7-6hxx-x8q5',
        package: 'ip-address',
        nodes: ['node_modules/npm/node_modules/ip-address']
      },
      {
        id: 'GHSA-xcx6-jx8p-x3h5',
        package: '@azure/msal-node',
        nodes: ['node_modules/@azure/msal-node']
      }
    ])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('outside the documented exemptions')
  })

  it('should fail an exemption that no longer appears', () => {
    const result = run([
      { id: 'GHSA-4qv8-2p9j-2685', package: 'undici', nodes: [VENDORED] }
    ])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('no longer appear')
    expect(result.stderr).toContain('exempt at node_modules/@azure/msal-node')
  })

  it('should fail a copy of the same advisory on a repo path', () => {
    const result = run([
      {
        id: 'GHSA-4qv8-2p9j-2685',
        package: 'undici',
        nodes: ['node_modules/undici']
      }
    ])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('exempt only at')
    expect(result.stderr).toContain('found at node_modules/undici')
  })

  it('should fail when the advisory appears at the exempt path and elsewhere', () => {
    const result = run([
      {
        id: 'GHSA-4qv8-2p9j-2685',
        package: 'undici',
        nodes: [VENDORED, 'node_modules/undici']
      }
    ])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'found at node_modules/npm/node_modules/undici, node_modules/undici'
    )
  })

  it('should fail an advisory that no entry lists', () => {
    const result = run([
      {
        id: 'GHSA-zzzz-0000-0001',
        package: 'left-pad',
        nodes: ['node_modules/left-pad']
      }
    ])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('GHSA-zzzz-0000-0001')
    expect(result.stderr).toContain('not exempt')
  })
})
