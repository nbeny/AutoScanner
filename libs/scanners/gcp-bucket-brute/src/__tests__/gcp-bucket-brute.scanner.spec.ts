import { GcpBucketBruteScanner } from '../gcp-bucket-brute.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('GcpBucketBruteScanner', () => {
  it('declares name, image, TEXT file → gcp-bucket-brute-text, produces OrgMetadata + Finding', () => {
    expect(GcpBucketBruteScanner.name).toBe('gcp-bucket-brute');
    expect(GcpBucketBruteScanner.docker.image).toBe('autoscanner/gcp-bucket-brute:1.0');
    expect(GcpBucketBruteScanner.docker.readonlyRootfs).toBe(true);
    expect(GcpBucketBruteScanner.docker.network).toBe('bridge');
    expect(GcpBucketBruteScanner.docker.capabilities).toEqual([]);
    expect(GcpBucketBruteScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: { path: '/out/result.txt' },
      parser: 'gcp-bucket-brute-text',
    });
    expect(GcpBucketBruteScanner.produces).toEqual(['OrgMetadata', 'Finding']);
  });

  it('build() derives keyword from target (cloud-enum pattern) and defaults to small wordlist', () => {
    const input = GcpBucketBruteScanner.inputSchema.parse({});
    const { cmd } = GcpBucketBruteScanner.build(input, 'acme.tld', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('python /opt/gcpbucketbrute/gcpbucketbrute.py');
    expect(cmd[2]).toContain("-k 'acme'");
    expect(cmd[2]).toContain('-u');
    expect(cmd[2]).toContain('-w /opt/wordlists/small.txt');
    expect(cmd[2]).toContain('-o /out/result.txt');
  });

  it('build() honours explicit keyword override', () => {
    const input = GcpBucketBruteScanner.inputSchema.parse({ keyword: 'my-corp' });
    const { cmd } = GcpBucketBruteScanner.build(input, 'irrelevant.tld', ctx);
    expect(cmd[2]).toContain("-k 'my-corp'");
  });

  it('build() switches to medium wordlist when wordlistSize=medium', () => {
    const input = GcpBucketBruteScanner.inputSchema.parse({ wordlistSize: 'medium' });
    const { cmd } = GcpBucketBruteScanner.build(input, 'acme.tld', ctx);
    expect(cmd[2]).toContain('-w /opt/wordlists/medium.txt');
  });

  it('build() switches to large wordlist when wordlistSize=large', () => {
    const input = GcpBucketBruteScanner.inputSchema.parse({ wordlistSize: 'large' });
    const { cmd } = GcpBucketBruteScanner.build(input, 'acme.tld', ctx);
    expect(cmd[2]).toContain('-w /opt/wordlists/large.txt');
  });

  it('build() strips wildcard prefix and falls back to label like cloud-enum', () => {
    const input = GcpBucketBruteScanner.inputSchema.parse({});
    const { cmd } = GcpBucketBruteScanner.build(input, '*.acme.tld', ctx);
    expect(cmd[2]).toContain("-k 'acme'");
  });

  it('rejects unknown wordlistSize via zod', () => {
    expect(() => GcpBucketBruteScanner.inputSchema.parse({ wordlistSize: 'xxl' })).toThrow();
  });
});
