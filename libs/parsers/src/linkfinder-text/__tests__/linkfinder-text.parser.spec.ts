import { LinkfinderTextParser } from '../linkfinder-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'linkfinder',
  target: 'https://acme.tld/static/app.js',
  engagementId: 'e',
};

describe('LinkfinderTextParser', () => {
  const parser = new LinkfinderTextParser();

  it('extracts relative + absolute URLs from cli output as endpoints', async () => {
    const output = [
      '/api/v1/users',
      'https://api.acme.tld/v2/products',
      '/admin/panel',
      '/api/v1/users',
    ].join('\n');
    const out = await parser.parse(output, ctx);
    const urls = out.endpoints.map((e) => e.url).sort();
    expect(urls).toEqual([
      'https://acme.tld/admin/panel',
      'https://acme.tld/api/v1/users',
      'https://api.acme.tld/v2/products',
    ]);
  });

  it('returns empty output on empty input', async () => {
    expect((await parser.parse('', ctx)).endpoints).toHaveLength(0);
  });

  it('drops lines that do not look like URLs or paths', async () => {
    const out = await parser.parse('Running on https://acme.tld/static/app.js\n[INFO] done', ctx);
    expect(out.endpoints.find((e) => e.url.includes('[INFO]'))).toBeUndefined();
  });
});
