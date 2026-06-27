import { GospiderJsonParser } from '../gospider-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'gospider',
  target: 'https://acme.tld',
  engagementId: 'e',
};

const SAMPLE = [
  JSON.stringify({
    output_type: 'href',
    output: 'https://acme.tld/about',
    status: '200',
    length: 1024,
  }),
  JSON.stringify({
    output_type: 'subdomain',
    output: 'api.acme.tld',
  }),
  JSON.stringify({
    output_type: 'url',
    output: 'https://acme.tld/contact',
    status: '301',
  }),
  '',
  'garbage',
].join('\n');

describe('GospiderJsonParser', () => {
  it('maps href/url lines to endpoints with method GET', async () => {
    const out = await new GospiderJsonParser().parse(SAMPLE, ctx);
    expect(out.endpoints).toEqual([
      { url: 'https://acme.tld/about', method: 'GET', statusCode: 200, contentLength: 1024 },
      { url: 'https://acme.tld/contact', method: 'GET', statusCode: 301 },
    ]);
  });

  it('maps subdomain lines to assets type=SUBDOMAIN', async () => {
    const out = await new GospiderJsonParser().parse(SAMPLE, ctx);
    expect(out.assets).toEqual([{ type: 'SUBDOMAIN', value: 'api.acme.tld' }]);
  });

  it('skips malformed JSON lines', async () => {
    const out = await new GospiderJsonParser().parse('garbage\n', ctx);
    expect(out.endpoints).toHaveLength(0);
    expect(out.assets).toHaveLength(0);
  });
});
