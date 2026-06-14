import { FaviconJsonParser } from '../favicon-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'favicon',
  target: 'example.com',
  engagementId: 'e',
};

describe('FaviconJsonParser', () => {
  const parser = new FaviconJsonParser();

  it('emits a favicon-hash Technology per host with a non-empty favicon field', async () => {
    const input = [
      JSON.stringify({ host: 'example.com', url: 'https://example.com', favicon: '-1234567890' }),
      JSON.stringify({ host: 'no-favicon.com', url: 'https://no-favicon.com' }),
    ].join('\n');
    const out = await parser.parse(input, ctx);
    expect(out.technologies).toHaveLength(1);
    expect(out.technologies[0]).toEqual(
      expect.objectContaining({
        assetValue: 'example.com',
        name: 'favicon-hash:-1234567890',
        categories: ['favicon'],
      }),
    );
  });

  it('returns empty on blank/garbage', async () => {
    expect((await parser.parse('', ctx)).technologies).toHaveLength(0);
    expect((await parser.parse('not json', ctx)).technologies).toHaveLength(0);
  });
});
