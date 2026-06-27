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

describe('KiterunnerTextParser — Phase 14A Finding emission', () => {
  const parser = new KiterunnerTextParser();

  it('emits MEDIUM Finding on 200-status undocumented routes (default)', async () => {
    const krCtx = { ...ctx, scannerName: 'kiterunner' };
    const text = ['GET     200 [  1234,   45,  6] https://api.example.com/api/v1/products 0c'].join(
      '\n',
    );
    const out = await parser.parse(text, krCtx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      scannerName: 'kiterunner',
      title: 'KITERUNNER_UNDOCUMENTED_ROUTE',
      severity: 'MEDIUM',
      location: 'https://api.example.com/api/v1/products',
    });
  });

  it('upgrades to HIGH on sensitive paths /admin, /internal, /debug, /console', async () => {
    const text = [
      'GET 200 [1, 2, 3] https://api.example.com/admin 0c',
      'GET 200 [1, 2, 3] https://api.example.com/internal/healthz 0c',
      'GET 200 [1, 2, 3] https://api.example.com/debug/vars 0c',
      'GET 200 [1, 2, 3] https://api.example.com/console 0c',
    ].join('\n');
    const out = await parser.parse(text, ctx);
    const sevs = out.findings.map((f) => f.severity).sort();
    expect(sevs).toEqual(['HIGH', 'HIGH', 'HIGH', 'HIGH']);
    expect(out.findings.every((f) => f.title === 'KITERUNNER_SENSITIVE_ROUTE')).toBe(true);
  });

  it('upgrades to HIGH on /v*/users pattern', async () => {
    const text = 'GET 200 [1, 2, 3] https://api.example.com/v2/users 0c';
    const out = await parser.parse(text, ctx);
    expect(out.findings[0]).toMatchObject({
      severity: 'HIGH',
      title: 'KITERUNNER_SENSITIVE_ROUTE',
    });
  });

  it('does not emit Finding on non-200 statuses (still emits Endpoint)', async () => {
    const text = 'POST 401 [1, 2, 3] https://api.example.com/login 0c';
    const out = await parser.parse(text, ctx);
    expect(out.endpoints).toHaveLength(1);
    expect(out.findings).toHaveLength(0);
  });

  it('uses scannerName from context for Findings (kiterunner scanner sets it to kiterunner)', async () => {
    const krCtx = { ...ctx, scannerName: 'kiterunner' };
    const text = 'GET 200 [1, 2, 3] https://api.example.com/admin 0c';
    const out = await parser.parse(text, krCtx);
    expect(out.findings[0].scannerName).toBe('kiterunner');
  });
});
