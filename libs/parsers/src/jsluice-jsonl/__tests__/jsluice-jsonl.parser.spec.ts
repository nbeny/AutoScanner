import { JsluiceJsonlParser } from '../jsluice-jsonl.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'jsluice',
  target: 'https://acme.tld/app.js',
  engagementId: 'e',
};

describe('JsluiceJsonlParser', () => {
  it('parses urls pass into endpoints', async () => {
    const text = [
      JSON.stringify({ url: 'https://api.acme.tld/v1/users', type: 'fetch', source: 'app.js' }),
      JSON.stringify({ url: '/api/v1/login', type: 'xhr', source: 'app.js' }),
    ].join('\n');
    const out = await new JsluiceJsonlParser().parse(text, ctx);
    const urls = out.endpoints.map((e) => e.url).sort();
    expect(urls).toEqual(['/api/v1/login', 'https://api.acme.tld/v1/users']);
  });

  it('maps AWS access-key kind → HIGH', async () => {
    const text = JSON.stringify({
      kind: 'AWSAccessKey',
      data: 'AKIAIOSFODNN7EXAMPLE',
      filename: 'https://acme.tld/app.js',
    });
    const out = await new JsluiceJsonlParser().parse(text, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      scannerName: 'jsluice',
      severity: 'HIGH',
      title: 'JSLUICE_SECRET_AWSAccessKey',
      location: 'https://acme.tld/app.js',
    });
  });

  it('maps JWT/OAuth kinds → HIGH', async () => {
    const text = [
      JSON.stringify({ kind: 'JWT', data: 'eyJhbGciOi...', filename: 'a.js' }),
      JSON.stringify({ kind: 'OAuthToken', data: 'token-x', filename: 'b.js' }),
    ].join('\n');
    const out = await new JsluiceJsonlParser().parse(text, ctx);
    expect(out.findings.every((f) => f.severity === 'HIGH')).toBe(true);
  });

  it('maps unknown / suspect kinds → MEDIUM', async () => {
    const text = JSON.stringify({ kind: 'genericSecret', data: 'maybe?', filename: 'c.js' });
    const out = await new JsluiceJsonlParser().parse(text, ctx);
    expect(out.findings[0].severity).toBe('MEDIUM');
  });

  it('skips malformed lines without throwing', async () => {
    const out = await new JsluiceJsonlParser().parse('not-json\n\n{}', ctx);
    expect(out.endpoints).toHaveLength(0);
    expect(out.findings).toHaveLength(0);
  });
});
