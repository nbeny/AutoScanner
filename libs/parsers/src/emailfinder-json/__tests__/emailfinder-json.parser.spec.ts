import { EmailfinderJsonParser } from '../emailfinder-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'emailfinder',
  target: 'acme.tld',
  engagementId: 'e',
};

describe('EmailfinderJsonParser', () => {
  const parser = new EmailfinderJsonParser();

  it('emits one Email per discovered address with source=emailfinder', async () => {
    const text = JSON.stringify({
      domain: 'acme.tld',
      emails: ['alice@acme.tld', 'bob@acme.tld'],
    });
    const out = await parser.parse(text, ctx);
    expect(out.emails).toEqual([
      { address: 'alice@acme.tld', source: 'emailfinder' },
      { address: 'bob@acme.tld', source: 'emailfinder' },
    ]);
  });

  it('dedupes repeated addresses', async () => {
    const text = JSON.stringify({
      emails: ['x@y.tld', 'x@y.tld', 'X@Y.tld'],
    });
    const out = await parser.parse(text, ctx);
    expect(out.emails).toHaveLength(1);
    expect(out.emails[0].address).toBe('x@y.tld');
  });

  it('drops entries that are not valid email addresses', async () => {
    const text = JSON.stringify({
      emails: ['not-an-email', 'still@valid.tld', 'also@v.io'],
    });
    const out = await parser.parse(text, ctx);
    expect(out.emails.map((e) => e.address).sort()).toEqual(['also@v.io', 'still@valid.tld']);
  });

  it('handles malformed JSON without throwing', async () => {
    expect((await parser.parse('not-json', ctx)).emails).toHaveLength(0);
  });
});
