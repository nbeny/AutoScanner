import { EmailrepScanner } from '../emailrep.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('EmailrepScanner', () => {
  it('declares name, image, JSONL file → emailrep-jsonl, produces Finding', () => {
    expect(EmailrepScanner.name).toBe('emailrep');
    expect(EmailrepScanner.docker.image).toBe('autoscanner/emailrep:1.0');
    expect(EmailrepScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: { path: '/out/result.jsonl' },
      parser: 'emailrep-jsonl',
    });
    expect(EmailrepScanner.produces).toEqual(['Finding']);
  });

  it('declares EMAILREP credential + EMAILREP_API_KEY env var', () => {
    expect(EmailrepScanner.requiresCredential).toBe('EMAILREP');
    expect(EmailrepScanner.credentialEnvVar).toBe('EMAILREP_API_KEY');
  });

  it('build() invokes emailrep with the target email and appends to /out/result.jsonl', () => {
    const input = EmailrepScanner.inputSchema.parse({});
    const { cmd } = EmailrepScanner.build(input, 'alice@acme.tld', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain("emailrep --json 'alice@acme.tld'");
    expect(cmd[2]).toContain('/out/result.jsonl');
  });
});
