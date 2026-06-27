import { HakrawlerScanner } from '../hakrawler.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('HakrawlerScanner', () => {
  it('declares name, image, TEXT stdout → hakrawler-text, produces Endpoint', () => {
    expect(HakrawlerScanner.name).toBe('hakrawler');
    expect(HakrawlerScanner.docker.image).toBe('autoscanner/hakrawler:1.0');
    expect(HakrawlerScanner.docker.readonlyRootfs).toBe(true);
    expect(HakrawlerScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'hakrawler-text',
    });
    expect(HakrawlerScanner.produces).toEqual(['Endpoint']);
  });

  it('build() pipes target to hakrawler with default depth 2 and subs=true', () => {
    const input = HakrawlerScanner.inputSchema.parse({});
    const { cmd, stdin } = HakrawlerScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd).toEqual(['hakrawler', '-d', '2', '-subs', '-plain']);
    expect(stdin).toBe('https://acme.tld\n');
  });

  it('build() omits -subs when subdomainsInScope is false', () => {
    const input = HakrawlerScanner.inputSchema.parse({ subdomainsInScope: false });
    const { cmd } = HakrawlerScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd).not.toContain('-subs');
  });

  it('build() honours custom depth', () => {
    const input = HakrawlerScanner.inputSchema.parse({ depth: 5 });
    const { cmd } = HakrawlerScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd).toContain('-d');
    expect(cmd).toContain('5');
  });

  it('rejects depth > 10 via zod', () => {
    expect(() => HakrawlerScanner.inputSchema.parse({ depth: 99 })).toThrow();
  });
});
