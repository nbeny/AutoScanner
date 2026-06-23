import { SubjsTextParser } from '../subjs-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'subjs',
  target: 'example.com',
  engagementId: 'e',
};

const SAMPLE = [
  'https://example.com/static/app.js',
  'https://cdn.example.com/vendor.js',
  '',
  'not a url',
  'https://example.com/static/app.js',
].join('\n');

describe('SubjsTextParser', () => {
  it('emits a deduped endpoint per JS url, ignoring blanks and non-urls', async () => {
    const out = await new SubjsTextParser().parse(SAMPLE, ctx);
    const urls = out.endpoints.map((e) => e.url).sort();
    expect(urls).toEqual([
      'https://cdn.example.com/vendor.js',
      'https://example.com/static/app.js',
    ]);
  });

  it('returns empty output for blank input', async () => {
    expect((await new SubjsTextParser().parse('', ctx)).endpoints).toHaveLength(0);
  });
});
