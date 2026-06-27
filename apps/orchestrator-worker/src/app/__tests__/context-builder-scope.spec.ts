import { ContextBuilder } from '../context-builder.service';

describe('ContextBuilder — engagement-scope gate on endpoints (Phase 13C)', () => {
  const prisma = {
    scopeRule: {
      findMany: jest.fn(),
    },
    endpoint: {
      findMany: jest.fn(),
    },
    subdomain: { findMany: jest.fn() },
    ipAddress: { findMany: jest.fn() },
  } as never;

  const builder = new ContextBuilder(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma as { scopeRule: { findMany: jest.Mock } }).scopeRule.findMany.mockResolvedValue([
      { ruleType: 'INCLUDE', targetType: 'WILDCARD_DOMAIN', value: 'acme.tld' },
    ]);
  });

  it('keeps in-scope endpoints', async () => {
    (prisma as { endpoint: { findMany: jest.Mock } }).endpoint.findMany.mockResolvedValue([
      { canonicalUrl: 'https://acme.tld/admin' },
      { canonicalUrl: 'https://api.acme.tld/v1' },
    ]);
    const result = await builder.buildTargets(
      { scannerName: 'cariddi', inputs: {}, target: { kind: 'context', path: 'endpoints' } },
      { id: 'r', engagementId: 'e', target: 'acme.tld' },
      5,
    );
    expect(result).toEqual(['https://acme.tld/admin', 'https://api.acme.tld/v1']);
  });

  it('drops out-of-scope endpoints emitted by crawlers (e.g. external links)', async () => {
    (prisma as { endpoint: { findMany: jest.Mock } }).endpoint.findMany.mockResolvedValue([
      { canonicalUrl: 'https://acme.tld/admin' },
      { canonicalUrl: 'https://evil.example/leak' },
      { canonicalUrl: 'https://cdn.thirdparty.io/lib.js' },
    ]);
    const result = await builder.buildTargets(
      { scannerName: 'corsy', inputs: {}, target: { kind: 'context', path: 'endpoints' } },
      { id: 'r', engagementId: 'e', target: 'acme.tld' },
      5,
    );
    expect(result).toEqual(['https://acme.tld/admin']);
    expect(result).not.toEqual(expect.arrayContaining(['https://evil.example/leak']));
    expect(result).not.toEqual(expect.arrayContaining(['https://cdn.thirdparty.io/lib.js']));
  });

  it('falls back to root target if ALL endpoints get filtered out (D3 fallback)', async () => {
    (prisma as { endpoint: { findMany: jest.Mock } }).endpoint.findMany.mockResolvedValue([
      { canonicalUrl: 'https://evil.example/leak' },
    ]);
    const result = await builder.buildTargets(
      { scannerName: 'cariddi', inputs: {}, target: { kind: 'context', path: 'endpoints' } },
      { id: 'r', engagementId: 'e', target: 'acme.tld' },
      5,
    );
    expect(result).toEqual(['acme.tld']);
  });

  it('skips scope check on step 0 (the root target was already scope-checked at runTemplate)', async () => {
    (prisma as { endpoint: { findMany: jest.Mock } }).endpoint.findMany.mockResolvedValue([]);
    const result = await builder.buildTargets(
      { scannerName: 'feroxbuster', inputs: {}, target: { kind: 'context', path: 'target' } },
      { id: 'r', engagementId: 'e', target: 'acme.tld' },
      0,
    );
    expect(result).toEqual(['acme.tld']);
  });
});
