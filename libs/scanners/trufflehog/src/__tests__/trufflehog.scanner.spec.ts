import { TrufflehogScanner } from '../trufflehog.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('TrufflehogScanner', () => {
  it('requires GITHUB token, emits JSONL → trufflehog-json, produces Finding', () => {
    expect(TrufflehogScanner.name).toBe('trufflehog');
    expect(TrufflehogScanner.requiresCredential).toBe('GITHUB');
    expect(TrufflehogScanner.credentialEnvVar).toBe('GITHUB_TOKEN');
    expect(TrufflehogScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'trufflehog-json',
    });
    expect(TrufflehogScanner.produces).toEqual(expect.arrayContaining(['Finding']));
  });
  it('build() scans the org derived from the target apex label, with token + --json', () => {
    const { cmd } = TrufflehogScanner.build(
      TrufflehogScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(cmd[2]).toContain('trufflehog');
    expect(cmd[2]).toContain('--json');
    expect(cmd[2]).toContain('"$GITHUB_TOKEN"');
    expect(cmd[2]).toContain("'example'");
  });
});
