import { Graphw00fJsonParser } from '../graphw00f-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'graphw00f',
  target: 'https://acme.tld',
  engagementId: 'e',
};

describe('Graphw00fJsonParser', () => {
  const parser = new Graphw00fJsonParser();

  it('emits Endpoint + Technology when both detected and fingerprinted', async () => {
    const out = await parser.parse(
      JSON.stringify({
        detected: true,
        url: 'https://acme.tld/api/graphql',
        engine: { name: 'Apollo', version: '4.x' },
      }),
      ctx,
    );
    expect(out.endpoints).toEqual([{ url: 'https://acme.tld/api/graphql' }]);
    expect(out.technologies).toEqual([
      { assetValue: 'acme.tld', name: 'Apollo', version: '4.x', categories: ['GraphQL Engine'] },
    ]);
  });

  it('emits only Endpoint when no engine identified', async () => {
    const out = await parser.parse(
      JSON.stringify({ detected: true, url: 'https://acme.tld/graphql' }),
      ctx,
    );
    expect(out.endpoints).toHaveLength(1);
    expect(out.technologies).toHaveLength(0);
  });

  it('emits nothing when detection failed', async () => {
    const out = await parser.parse(JSON.stringify({ detected: false }), ctx);
    expect(out.endpoints).toHaveLength(0);
    expect(out.technologies).toHaveLength(0);
  });

  it('handles malformed JSON without throwing', async () => {
    const out = await parser.parse('not-json', ctx);
    expect(out.endpoints).toHaveLength(0);
  });
});
