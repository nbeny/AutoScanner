import { EmailfinderScanner } from '../emailfinder.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('EmailfinderScanner', () => {
  it('declares name, image, JSON stdout → emailfinder-json, produces Email', () => {
    expect(EmailfinderScanner.name).toBe('emailfinder');
    expect(EmailfinderScanner.docker.image).toBe('autoscanner/emailfinder:1.0');
    expect(EmailfinderScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'emailfinder-json',
    });
    expect(EmailfinderScanner.produces).toEqual(['Email']);
  });

  it('build() defaults to google,bing,baidu engines', () => {
    const input = EmailfinderScanner.inputSchema.parse({});
    const { cmd } = EmailfinderScanner.build(input, 'acme.tld', ctx);
    expect(cmd).toContain('python');
    expect(cmd).toContain('/opt/emailfinder/emailfinder.py');
    expect(cmd).toContain('-d');
    expect(cmd).toContain('acme.tld');
    expect(cmd).toContain('-e');
    expect(cmd).toContain('google,bing,baidu');
    expect(cmd).toContain('-j');
  });

  it('build() honours custom engine list', () => {
    const input = EmailfinderScanner.inputSchema.parse({ engines: ['google'] });
    const { cmd } = EmailfinderScanner.build(input, 'acme.tld', ctx);
    expect(cmd).toContain('google');
    expect(cmd).not.toContain('bing');
  });

  it('rejects non-alphanumeric engine names via zod', () => {
    expect(() => EmailfinderScanner.inputSchema.parse({ engines: ['google$$$'] })).toThrow();
  });
});
