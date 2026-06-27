import { HakrawlerTextParser } from '../hakrawler-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'hakrawler',
  target: 'https://acme.tld',
  engagementId: 'e',
};

describe('HakrawlerTextParser', () => {
  it('parses one URL per line, GET, no status', async () => {
    const out = await new HakrawlerTextParser().parse(
      'https://acme.tld/a\nhttps://acme.tld/b\n',
      ctx,
    );
    expect(out.endpoints).toHaveLength(2);
    expect(out.endpoints[0]).toEqual({ url: 'https://acme.tld/a', method: 'GET' });
    expect(out.endpoints[1]).toEqual({ url: 'https://acme.tld/b', method: 'GET' });
  });

  it('skips blank and non-URL lines', async () => {
    const out = await new HakrawlerTextParser().parse('\nnot-a-url\nhttps://acme.tld/x\n', ctx);
    expect(out.endpoints).toHaveLength(1);
    expect(out.endpoints[0].url).toBe('https://acme.tld/x');
  });

  it('returns empty output on empty input', async () => {
    const out = await new HakrawlerTextParser().parse('', ctx);
    expect(out.endpoints).toHaveLength(0);
  });
});
