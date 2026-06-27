import { GitleaksJsonParser } from '../gitleaks-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'gitleaks',
  target: 'example.com',
  engagementId: 'e',
};

const SAMPLE = JSON.stringify([
  {
    RuleID: 'aws-access-token',
    Description: 'AWS Access Token',
    File: 'src/config.py',
    StartLine: 42,
    Commit: 'abc123',
    Secret: 'AKIA1234567890ABCDEF',
    Match: 'AWS_KEY=AKIA1234567890ABCDEF',
  },
  {
    RuleID: 'generic-api-key',
    Description: 'Generic API Key',
    File: 'README.md',
    StartLine: 10,
    Commit: 'def456',
    Secret: 'sk_live_aabbcc',
  },
]);

describe('GitleaksJsonParser', () => {
  it('emits one HIGH finding per leak with the secret REDACTED', async () => {
    const out = await new GitleaksJsonParser().parse(SAMPLE, ctx);
    expect(out.findings).toHaveLength(2);
    expect(out.findings[0]).toMatchObject({
      scannerName: 'gitleaks',
      severity: 'HIGH',
      title: expect.stringContaining('AWS Access Token'),
      location: 'src/config.py:42',
    });
    // Secret value must NOT survive into evidence.
    const ev0 = out.findings[0].evidence as Record<string, unknown>;
    expect(ev0['Secret']).toBe('REDACTED');
    expect(ev0['Match']).toBe('REDACTED');
    expect(ev0['RuleID']).toBe('aws-access-token');
  });

  it('returns empty output on blank or non-array input', async () => {
    expect((await new GitleaksJsonParser().parse('', ctx)).findings).toEqual([]);
    expect((await new GitleaksJsonParser().parse('{}', ctx)).findings).toEqual([]);
  });
});
