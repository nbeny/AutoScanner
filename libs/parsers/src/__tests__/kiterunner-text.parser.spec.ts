import { KiterunnerTextParser } from '../kiterunner-text';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'api-discovery',
  target: 'https://api.example.com',
  engagementId: 'e',
};

describe('KiterunnerTextParser', () => {
  const parser = new KiterunnerTextParser();

  it('extracts discovered API routes as Endpoints (deduped) with method + status', async () => {
    const text = [
      'GET     200 [  1234,   45,  6] https://api.example.com/api/v1/users 0cf6841b',
      'POST    401 [    12,    2,  1] https://api.example.com/api/v1/login abcd',
      'GET     200 [  1234,   45,  6] https://api.example.com/api/v1/users 0cf6841b',
    ].join('\n');
    const out = await parser.parse(text, ctx);
    const urls = out.endpoints.map((e) => e.url).sort();
    expect(urls).toEqual([
      'https://api.example.com/api/v1/login',
      'https://api.example.com/api/v1/users',
    ]);
    const users = out.endpoints.find((e) => e.url.endsWith('/users'));
    expect(users?.method).toBe('GET');
    expect(users?.statusCode).toBe(200);
  });

  it('tolerant of blank/garbage', async () => {
    expect((await parser.parse('', ctx)).endpoints).toHaveLength(0);
  });
});
