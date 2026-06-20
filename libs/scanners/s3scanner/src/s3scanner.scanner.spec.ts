import { S3scannerScanner } from './s3scanner.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp' };

describe('S3scannerScanner', () => {
  it('declares identity, CLOUD category and output parser', () => {
    expect(S3scannerScanner.name).toBe('s3scanner');
    expect(S3scannerScanner.produces).toEqual(['Finding']);
    expect(S3scannerScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 's3scanner-json',
    });
    expect(S3scannerScanner.requiresCredential).toBeUndefined();
  });

  it('builds a single-bucket scan command with JSON output', () => {
    const { cmd } = S3scannerScanner.build({}, 'acme', ctx);
    expect(cmd).toEqual(['s3scanner', '-json', 'scan', '-bucket', 'acme']);
  });
});
