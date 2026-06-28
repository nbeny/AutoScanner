import { ContextBuilder } from '../context-builder.service';

describe('ContextBuilder — emails context path (Phase 14B)', () => {
  const prisma = {
    scopeRule: { findMany: jest.fn() },
    endpoint: { findMany: jest.fn() },
    subdomain: { findMany: jest.fn() },
    ipAddress: { findMany: jest.fn() },
    email: { findMany: jest.fn() },
  } as never;

  const builder = new ContextBuilder(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves path:emails to the deduplicated list of Email.address rows for the engagement', async () => {
    (prisma as { email: { findMany: jest.Mock } }).email.findMany.mockResolvedValue([
      { address: 'alice@acme.tld' },
      { address: 'bob@acme.tld' },
    ]);
    const result = await builder.buildTargets(
      { scannerName: 'emailrep', inputs: {}, target: { kind: 'context', path: 'emails' } },
      { id: 'r', engagementId: 'e', target: 'acme.tld' },
      4,
    );
    expect(result).toEqual(['alice@acme.tld', 'bob@acme.tld']);
    expect((prisma as { email: { findMany: jest.Mock } }).email.findMany).toHaveBeenCalledWith({
      where: { engagementId: 'e' },
      select: { address: true },
    });
  });

  it('falls back to engagement root (D3) when no email row exists yet', async () => {
    (prisma as { email: { findMany: jest.Mock } }).email.findMany.mockResolvedValue([]);
    const result = await builder.buildTargets(
      { scannerName: 'emailrep', inputs: {}, target: { kind: 'context', path: 'emails' } },
      { id: 'r', engagementId: 'e', target: 'acme.tld' },
      4,
    );
    expect(result).toEqual(['acme.tld']);
  });

  it('does NOT apply the Phase 13C engagement-scope filter to emails (the scope-gate is only for endpoints)', async () => {
    (prisma as { email: { findMany: jest.Mock } }).email.findMany.mockResolvedValue([
      { address: 'alice@acme.tld' },
      { address: 'leak@third-party.io' },
    ]);
    const result = await builder.buildTargets(
      { scannerName: 'emailrep', inputs: {}, target: { kind: 'context', path: 'emails' } },
      { id: 'r', engagementId: 'e', target: 'acme.tld' },
      4,
    );
    expect(result).toEqual(['alice@acme.tld', 'leak@third-party.io']);
    expect(
      (prisma as { scopeRule: { findMany: jest.Mock } }).scopeRule.findMany,
    ).not.toHaveBeenCalled();
  });
});
