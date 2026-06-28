import { SwaksScanner } from '../swaks.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('SwaksScanner', () => {
  it('declares name, image, TEXT stdout → swaks-text, produces OrgMetadata + Finding', () => {
    expect(SwaksScanner.name).toBe('swaks');
    expect(SwaksScanner.docker.image).toBe('autoscanner/swaks:1.0');
    expect(SwaksScanner.docker.network).toBe('bridge');
    expect(SwaksScanner.docker.capabilities).toEqual([]);
    expect(SwaksScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'swaks-text',
    });
    expect(SwaksScanner.produces).toEqual(['OrgMetadata', 'Finding']);
  });

  it('build() defaults to port 25 + STARTTLS + EHLO-quit + no-data', () => {
    const input = SwaksScanner.inputSchema.parse({});
    const { cmd } = SwaksScanner.build(input, 'mail.acme.tld', ctx);
    expect(cmd).toContain('swaks');
    expect(cmd).toContain('--server');
    expect(cmd).toContain('mail.acme.tld');
    expect(cmd).toContain('--port');
    expect(cmd).toContain('25');
    expect(cmd).toContain('--quit-after');
    expect(cmd).toContain('EHLO');
    expect(cmd).toContain('--no-data');
    expect(cmd).toContain('--tls');
  });

  it('build() honours port override', () => {
    const input = SwaksScanner.inputSchema.parse({ port: 587 });
    const { cmd } = SwaksScanner.build(input, 'mail.acme.tld', ctx);
    expect(cmd).toContain('587');
  });

  it('build() switches to --tls-on-connect when tls=tls', () => {
    const input = SwaksScanner.inputSchema.parse({ tls: 'tls' });
    const { cmd } = SwaksScanner.build(input, 'mail.acme.tld', ctx);
    expect(cmd).toContain('--tls-on-connect');
  });

  it('build() omits both tls flags when tls=none', () => {
    const input = SwaksScanner.inputSchema.parse({ tls: 'none' });
    const { cmd } = SwaksScanner.build(input, 'mail.acme.tld', ctx);
    expect(cmd).not.toContain('--tls');
    expect(cmd).not.toContain('--tls-on-connect');
  });

  it('rejects unknown tls modes via zod', () => {
    expect(() => SwaksScanner.inputSchema.parse({ tls: 'xxx' })).toThrow();
  });
});
