import { SubzyJsonParser } from '../subzy-json/subzy-json.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'subzy',
  target: 'example.com',
  engagementId: 'e',
};

describe('SubzyJsonParser', () => {
  const parser = new SubzyJsonParser();

  it('declares name and JSON format', () => {
    expect(parser.name).toBe('subzy-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('emits a HIGH finding per vulnerable subdomain', async () => {
    const payload = JSON.stringify([
      { Subdomain: 'shop.example.com', Engine: 'Shopify', Vulnerable: true, HttpStatus: 404 },
      { Subdomain: 'safe.example.com', Engine: 'Github', Vulnerable: false, HttpStatus: 200 },
    ]);
    const out = await parser.parse(payload, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].severity).toBe('HIGH');
    expect(out.findings[0].scannerName).toBe('subzy');
    expect(out.findings[0].title).toContain('shop.example.com');
    expect(out.findings[0].title).toContain('Shopify');
    expect(out.findings[0].location).toBe('shop.example.com');
  });

  it('accepts lowercase key variants', async () => {
    const payload = JSON.stringify([
      { subdomain: 'x.example.com', engine: 'AWS/S3', vulnerable: true },
    ]);
    const out = await parser.parse(payload, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].location).toBe('x.example.com');
  });

  it('returns empty output on blank or non-array input', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
    expect((await parser.parse('not json', ctx)).findings).toHaveLength(0);
    expect((await parser.parse('{}', ctx)).findings).toHaveLength(0);
  });
});
