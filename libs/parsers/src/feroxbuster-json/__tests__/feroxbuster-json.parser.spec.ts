import { FeroxbusterJsonParser } from '../feroxbuster-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'feroxbuster',
  target: 'https://acme.tld',
  engagementId: 'e',
};

const SAMPLE = [
  JSON.stringify({
    type: 'response',
    url: 'https://acme.tld/admin',
    status: 200,
    content_length: 1234,
    method: 'GET',
  }),
  JSON.stringify({
    type: 'response',
    url: 'https://acme.tld/login',
    status: 302,
    content_length: 0,
    method: 'GET',
  }),
  JSON.stringify({ type: 'configuration', wordlist: '/etc/feroxbuster/wordlist.txt' }),
  '',
  'not-json',
].join('\n');

describe('FeroxbusterJsonParser', () => {
  it('maps only type=response lines into endpoints', async () => {
    const out = await new FeroxbusterJsonParser().parse(SAMPLE, ctx);
    expect(out.endpoints).toHaveLength(2);
    expect(out.endpoints[0]).toEqual({
      url: 'https://acme.tld/admin',
      method: 'GET',
      statusCode: 200,
      contentLength: 1234,
    });
    expect(out.endpoints[1]).toMatchObject({ url: 'https://acme.tld/login', statusCode: 302 });
  });

  it('skips malformed lines and non-response types', async () => {
    const out = await new FeroxbusterJsonParser().parse('not-json\n{}', ctx);
    expect(out.endpoints).toHaveLength(0);
  });

  it('returns empty output on empty input', async () => {
    const out = await new FeroxbusterJsonParser().parse('', ctx);
    expect(out.endpoints).toHaveLength(0);
  });
});
