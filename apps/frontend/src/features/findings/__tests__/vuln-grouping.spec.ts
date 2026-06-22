import { describe, expect, it } from 'vitest';
import { groupVulns, severityBreakdown, type VulnRow } from '../vuln-grouping';

const rows: VulnRow[] = [
  {
    id: '1',
    engagementId: 'e',
    title: 'a',
    severity: 'CRITICAL',
    cveId: 'CVE-1',
    status: 'OPEN',
    sources: ['nmap', 'nuclei'],
    riskScore: 9,
    assetId: 'a',
    assetValue: 'host-a',
    lastSeenAt: 't',
  },
  {
    id: '2',
    engagementId: 'e',
    title: 'b',
    severity: 'LOW',
    cveId: null,
    status: 'OPEN',
    sources: ['nmap'],
    riskScore: 2,
    assetId: 'b',
    assetValue: 'host-b',
    lastSeenAt: 't',
  },
];

describe('vuln-grouping', () => {
  it('groups by tool with multi-membership', () => {
    const g = groupVulns(rows, 'tool');
    expect(
      g
        .find((x) => x.key === 'nmap')
        ?.rows.map((r) => r.id)
        .sort(),
    ).toEqual(['1', '2']);
    expect(g.find((x) => x.key === 'nuclei')?.rows.map((r) => r.id)).toEqual(['1']);
  });
  it('groups by cve with a no-cve bucket', () => {
    const g = groupVulns(rows, 'cve');
    expect(g.find((x) => x.key === 'CVE-1')?.rows).toHaveLength(1);
    expect(g.some((x) => /sans CVE/i.test(x.label))).toBe(true);
  });
  it('groups by severity ordered critical→info', () => {
    const g = groupVulns(rows, 'severity');
    expect(g.map((x) => x.key)).toEqual(['CRITICAL', 'LOW']); // only present severities, in SEVERITY_ORDER
  });
  it('groups by asset using assetValue label', () => {
    const g = groupVulns(rows, 'asset');
    expect(g.find((x) => x.key === 'a')?.label).toBe('host-a');
  });
  it('groups by status', () => {
    const g = groupVulns(rows, 'status');
    expect(g.find((x) => x.key === 'OPEN')?.rows).toHaveLength(2);
  });
  it('counts severity breakdown with lowercase keys', () => {
    expect(severityBreakdown(rows)).toMatchObject({ critical: 1, low: 1 });
  });
});
