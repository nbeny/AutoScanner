import { CdncheckJsonParser } from '../cdncheck-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'cdncheck',
  target: 'example.com',
  engagementId: 'e',
};

describe('CdncheckJsonParser', () => {
  const parser = new CdncheckJsonParser();

  it('emits a CDN Technology when cdn/cloud/waf is flagged', async () => {
    const input = [
      JSON.stringify({ input: '1.2.3.4', cdn: true, cdn_name: 'cloudflare' }),
      JSON.stringify({ input: '5.6.7.8', cloud: true, cloud_name: 'aws' }),
      JSON.stringify({ input: '9.9.9.9' }),
    ].join('\n');
    const out = await parser.parse(input, ctx);
    const names = out.technologies.map((t) => t.name).sort();
    expect(names).toEqual(['CDN: cloudflare', 'cloud: aws']);
    expect(out.technologies.every((t) => t.categories?.includes('cdn'))).toBe(true);
  });

  it('tolerant of blank/garbage', async () => {
    expect((await parser.parse('', ctx)).technologies).toHaveLength(0);
  });
});
