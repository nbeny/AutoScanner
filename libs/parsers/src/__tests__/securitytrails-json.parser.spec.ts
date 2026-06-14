import { SecuritytrailsJsonParser } from '../securitytrails-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'securitytrails',
  target: 'example.com',
  engagementId: 'e',
};

describe('SecuritytrailsJsonParser', () => {
  const parser = new SecuritytrailsJsonParser();

  it('rebuilds FQDNs from labels + ctx.target as SUBDOMAIN assets', async () => {
    const input = JSON.stringify({ subdomains: ['www', 'api', 'mail'] });
    const out = await parser.parse(input, ctx);
    const values = out.assets.map((a) => a.value).sort();
    expect(values).toEqual(['api.example.com', 'mail.example.com', 'www.example.com']);
    expect(out.assets.every((a) => a.type === 'SUBDOMAIN')).toBe(true);
  });

  it('returns empty on blank/garbage or non-array subdomains', async () => {
    expect((await parser.parse('', ctx)).assets).toHaveLength(0);
    expect((await parser.parse('{"subdomains":"nope"}', ctx)).assets).toHaveLength(0);
  });
});
