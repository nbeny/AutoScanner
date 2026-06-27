import { CariddiJsonParser } from '../cariddi-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'cariddi',
  target: 'https://acme.tld',
  engagementId: 'e',
};

const SAMPLE = JSON.stringify({
  results: [
    {
      url: 'https://acme.tld/.env',
      matches: { secrets: [{ name: 'AWS Key', match: 'AKIA...' }] },
    },
    {
      url: 'https://acme.tld/admin/login',
      matches: { endpoints: [{ parameter: '/admin/login' }] },
    },
    {
      url: 'https://acme.tld/api/v1/users',
      matches: { infos: [{ name: 'Interesting endpoint', match: '/api/v1/users' }] },
    },
    {
      url: 'https://acme.tld/error500.html',
      matches: { errors: [{ name: 'Stack trace', match: 'java.lang.NullPointerException' }] },
    },
  ],
});

describe('CariddiJsonParser', () => {
  it('maps secret matches to HIGH findings with scannerName=cariddi', async () => {
    const out = await new CariddiJsonParser().parse(SAMPLE, ctx);
    const secret = out.findings.find((f) => f.title.includes('AWS Key'));
    expect(secret).toMatchObject({
      scannerName: 'cariddi',
      severity: 'HIGH',
      location: 'https://acme.tld/.env',
    });
  });

  it('maps interesting endpoint matches to LOW findings AND preserves the endpoint', async () => {
    const out = await new CariddiJsonParser().parse(SAMPLE, ctx);
    const interesting = out.findings.find((f) => f.title.includes('Interesting endpoint'));
    expect(interesting?.severity).toBe('LOW');
    expect(out.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://acme.tld/api/v1/users', method: 'GET' }),
      ]),
    );
  });

  it('maps error-page matches to LOW findings', async () => {
    const out = await new CariddiJsonParser().parse(SAMPLE, ctx);
    const err = out.findings.find((f) => f.title.includes('Stack trace'));
    expect(err?.severity).toBe('LOW');
    expect(err?.location).toBe('https://acme.tld/error500.html');
  });

  it('parses endpoints[] sub-array as endpoint findings (LOW)', async () => {
    const out = await new CariddiJsonParser().parse(SAMPLE, ctx);
    const ep = out.findings.find((f) => f.location === 'https://acme.tld/admin/login');
    expect(ep?.severity).toBe('LOW');
  });

  it('returns empty output on empty JSON', async () => {
    const out = await new CariddiJsonParser().parse('{"results":[]}', ctx);
    expect(out.findings).toHaveLength(0);
    expect(out.endpoints).toHaveLength(0);
  });

  it('handles malformed JSON without throwing', async () => {
    const out = await new CariddiJsonParser().parse('not-json', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
