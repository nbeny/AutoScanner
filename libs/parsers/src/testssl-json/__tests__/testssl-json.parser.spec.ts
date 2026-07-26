import { TestsslJsonParser } from '../testssl-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'testssl',
  target: 'x:443',
  engagementId: 'e',
};

describe('TestsslJsonParser', () => {
  it('keeps LOW+ findings, drops OK/INFO, and extracts the CVE', async () => {
    const sample = JSON.stringify([
      {
        id: 'heartbleed',
        ip: '1.2.3.4',
        port: '443',
        severity: 'CRITICAL',
        finding: 'vulnerable',
        cve: 'CVE-2014-0160',
      },
      {
        id: 'cipherlist_3DES',
        ip: '1.2.3.4',
        port: '443',
        severity: 'MEDIUM',
        finding: 'weak cipher',
      },
      { id: 'protocol_tls1_2', ip: '1.2.3.4', port: '443', severity: 'OK', finding: 'offered' },
    ]);
    const out = await new TestsslJsonParser().parse(sample, ctx);
    expect(out.findings).toHaveLength(2);
    expect(out.findings[0]).toMatchObject({
      severity: 'CRITICAL',
      cveId: 'CVE-2014-0160',
      location: '1.2.3.4:443',
      title: 'TLS: vulnerable',
    });
    expect(out.findings[1].severity).toBe('MEDIUM');
  });

  it('tolerates a non-array payload', async () => {
    const out = await new TestsslJsonParser().parse('{}', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
