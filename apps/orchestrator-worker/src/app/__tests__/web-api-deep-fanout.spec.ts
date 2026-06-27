import { ContextBuilder } from '../context-builder.service';

describe('ContextBuilder — web-api-deep endpoint context fan-out (target-tolerant)', () => {
  const prisma = {
    scopeRule: { findMany: jest.fn() },
    endpoint: { findMany: jest.fn() },
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

  it('passes the graphql endpoint among other endpoints to graphql-cop when graphw00f persisted one', async () => {
    (prisma as { endpoint: { findMany: jest.Mock } }).endpoint.findMany.mockResolvedValue([
      { canonicalUrl: 'https://acme.tld/api/graphql' },
      { canonicalUrl: 'https://acme.tld/static/app.js' },
    ]);
    const result = await builder.buildTargets(
      { scannerName: 'graphql-cop', inputs: {}, target: { kind: 'context', path: 'endpoints' } },
      { id: 'r', engagementId: 'e', target: 'acme.tld' },
      6,
    );
    expect(result).toContain('https://acme.tld/api/graphql');
    expect(result).toContain('https://acme.tld/static/app.js');
  });

  it('falls back to engagement root (D3) when no endpoint was persisted (graphql-cop becomes a no-op)', async () => {
    (prisma as { endpoint: { findMany: jest.Mock } }).endpoint.findMany.mockResolvedValue([]);
    const result = await builder.buildTargets(
      { scannerName: 'graphql-cop', inputs: {}, target: { kind: 'context', path: 'endpoints' } },
      { id: 'r', engagementId: 'e', target: 'acme.tld' },
      6,
    );
    expect(result).toEqual(['acme.tld']);
  });

  it('linkfinder/jsluice see the JS endpoint URLs from subjs, scope-filtered', async () => {
    (prisma as { endpoint: { findMany: jest.Mock } }).endpoint.findMany.mockResolvedValue([
      { canonicalUrl: 'https://acme.tld/static/app.js' },
      { canonicalUrl: 'https://evil.example/exfil.js' },
    ]);
    const result = await builder.buildTargets(
      { scannerName: 'linkfinder', inputs: {}, target: { kind: 'context', path: 'endpoints' } },
      { id: 'r', engagementId: 'e', target: 'acme.tld' },
      2,
    );
    expect(result).toEqual(['https://acme.tld/static/app.js']);
  });

  it('kiterunner targets the engagement root for host-level brute', async () => {
    const result = await builder.buildTargets(
      { scannerName: 'kiterunner', inputs: {}, target: { kind: 'context', path: 'target' } },
      { id: 'r', engagementId: 'e', target: 'acme.tld' },
      4,
    );
    expect(result).toEqual(['acme.tld']);
  });
});
