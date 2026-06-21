import { AbuseipdbScanner } from './abuseipdb.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j1', engagementId: 'e1', scratchDir: '/tmp' };

describe('AbuseipdbScanner', () => {
  it('declares identity, JSON/stdout → abuseipdb-json parser, requires ABUSEIPDB credential', () => {
    expect(AbuseipdbScanner.name).toBe('abuseipdb');
    expect(AbuseipdbScanner.docker.image).toBe('autoscanner/abuseipdb:1.0');
    expect(AbuseipdbScanner.outputs[0]).toEqual({ format: 'JSON', capture: 'stdout', parser: 'abuseipdb-json' });
    expect(AbuseipdbScanner.produces).toContain('Finding');
    expect(AbuseipdbScanner.requiresCredential).toBe('ABUSEIPDB');
    expect(AbuseipdbScanner.credentialEnvVar).toBe('ABUSEIPDB_API_KEY');
  });

  it('build() calls check.py with the target IP', () => {
    const { cmd } = AbuseipdbScanner.build(AbuseipdbScanner.inputSchema.parse({}), '1.2.3.4', ctx);
    expect(cmd).toEqual(['python3', '/usr/local/bin/check.py', '1.2.3.4']);
  });
});
