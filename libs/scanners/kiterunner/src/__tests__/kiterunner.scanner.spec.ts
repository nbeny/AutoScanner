import { KiterunnerScanner } from '../kiterunner.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('KiterunnerScanner', () => {
  it('declares name, image, TEXT stdout → kiterunner-text, produces Endpoint + Finding', () => {
    expect(KiterunnerScanner.name).toBe('kiterunner');
    expect(KiterunnerScanner.docker.image).toBe('autoscanner/kiterunner:1.0');
    expect(KiterunnerScanner.docker.readonlyRootfs).toBe(true);
    expect(KiterunnerScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'kiterunner-text',
    });
    expect(KiterunnerScanner.produces).toEqual(['Endpoint', 'Finding']);
  });

  it('build() runs kr scan with large wordlist and conservative defaults', () => {
    const input = KiterunnerScanner.inputSchema.parse({ urls: ['https://acme.tld'] });
    const { cmd } = KiterunnerScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain("printf '%s\\n' 'https://acme.tld' > /tmp/urls.txt");
    expect(cmd[2]).toContain('kr scan /tmp/urls.txt');
    expect(cmd[2]).toContain('-w /opt/wordlists/routes-large.kite');
    expect(cmd[2]).toContain('--max-connection-per-host 3');
    expect(cmd[2]).toContain('--quarantine-threshold 10');
  });

  it('build() honours custom maxConnPerHost and quarantineThreshold', () => {
    const input = KiterunnerScanner.inputSchema.parse({
      urls: ['https://a'],
      maxConnPerHost: 10,
      quarantineThreshold: 25,
    });
    const { cmd } = KiterunnerScanner.build(input, 'https://a', ctx);
    expect(cmd[2]).toContain('--max-connection-per-host 10');
    expect(cmd[2]).toContain('--quarantine-threshold 25');
  });

  it('build() appends -H per header', () => {
    const input = KiterunnerScanner.inputSchema.parse({
      urls: ['https://a'],
      headers: { Authorization: 'Bearer x' },
    });
    const { cmd } = KiterunnerScanner.build(input, 'https://a', ctx);
    expect(cmd[2]).toContain("-H 'Authorization: Bearer x'");
  });

  it('build() falls back to target when urls is empty', () => {
    const input = KiterunnerScanner.inputSchema.parse({});
    const { cmd } = KiterunnerScanner.build(input, 'https://only/', ctx);
    expect(cmd[2]).toContain("'https://only/'");
  });

  it('rejects maxConnPerHost > 50 via zod', () => {
    expect(() => KiterunnerScanner.inputSchema.parse({ maxConnPerHost: 999 })).toThrow();
  });
});
