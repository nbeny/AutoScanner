import { TrivyJsonParser } from '../trivy-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'trivy',
  target: 'nginx:latest',
  engagementId: 'e',
};

describe('TrivyJsonParser', () => {
  it('maps each vulnerability to a CVE finding with mapped severity', async () => {
    const sample = JSON.stringify({
      ArtifactName: 'nginx:latest',
      Results: [
        {
          Target: 'nginx:latest (debian 12)',
          Vulnerabilities: [
            {
              VulnerabilityID: 'CVE-2023-0001',
              PkgName: 'openssl',
              InstalledVersion: '3.0.1',
              FixedVersion: '3.0.2',
              Severity: 'HIGH',
              Title: 'openssl flaw',
            },
          ],
        },
        { Target: 'x', Vulnerabilities: null },
      ],
    });
    const out = await new TrivyJsonParser().parse(sample, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      cveId: 'CVE-2023-0001',
      severity: 'HIGH',
      title: 'CVE-2023-0001: openssl 3.0.1 (fixed in 3.0.2)',
    });
    expect(out.findings[0].location).toContain('nginx:latest');
  });

  it('tolerates a clean scan (null Results)', async () => {
    const out = await new TrivyJsonParser().parse(JSON.stringify({ Results: null }), ctx);
    expect(out.findings).toHaveLength(0);
  });
});
