import type { Prisma } from '@prisma/client';
import { EndpointPersister } from '../endpoint-persister';

const makeCtx = (overrides: Partial<{ engagementId: string; scannerName: string }> = {}) => ({
  engagementId: 'eng-1',
  scannerName: 'katana',
  scanJobId: 'job-1',
  target: 'example.com',
  ...overrides,
});

describe('EndpointPersister.upsert', () => {
  it('canonicalizes the URL before upserting (uppercase scheme+host → lowercase)', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ id: 'ep-1' });
    const mockFindFirst = jest.fn().mockResolvedValue(null);

    const tx = {
      subdomain: { findFirst: mockFindFirst },
      endpoint: { upsert: mockUpsert },
    };

    const persister = new EndpointPersister({} as never);

    await persister.upsert(
      [{ url: 'HTTP://Example.com/A', method: 'GET' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const callArgs = mockUpsert.mock.calls[0][0];
    expect(callArgs.where.engagementId_canonicalUrl_method.canonicalUrl).toBe(
      'http://example.com/A',
    );
    expect(callArgs.create.canonicalUrl).toBe('http://example.com/A');
    // original url preserved in create
    expect(callArgs.create.url).toBe('HTTP://Example.com/A');
  });

  it('resolves subdomainId when a matching Subdomain exists', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ id: 'ep-2' });
    const mockFindFirst = jest.fn().mockResolvedValue({ id: 'sub-99' });

    const tx = {
      subdomain: { findFirst: mockFindFirst },
      endpoint: { upsert: mockUpsert },
    };

    const persister = new EndpointPersister({} as never);

    await persister.upsert(
      [{ url: 'https://api.example.com/v1', method: 'POST' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { engagementId: 'eng-1', canonicalValue: 'api.example.com' },
      select: { id: true },
    });
    expect(mockUpsert.mock.calls[0][0].create.subdomainId).toBe('sub-99');
    expect(mockUpsert.mock.calls[0][0].update.subdomainId).toBe('sub-99');
  });

  it('sets subdomainId to null when no matching Subdomain exists', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ id: 'ep-3' });
    const mockFindFirst = jest.fn().mockResolvedValue(null);

    const tx = {
      subdomain: { findFirst: mockFindFirst },
      endpoint: { upsert: mockUpsert },
    };

    const persister = new EndpointPersister({} as never);

    await persister.upsert(
      [{ url: 'https://unknown.example.com/path' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(mockUpsert.mock.calls[0][0].create.subdomainId).toBeNull();
    expect(mockUpsert.mock.calls[0][0].update.subdomainId).toBeNull();
  });

  it('defaults method to GET when endpoint.method is undefined', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ id: 'ep-4' });
    const mockFindFirst = jest.fn().mockResolvedValue(null);

    const tx = {
      subdomain: { findFirst: mockFindFirst },
      endpoint: { upsert: mockUpsert },
    };

    const persister = new EndpointPersister({} as never);

    await persister.upsert(
      [{ url: 'https://example.com/nomethod' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(mockUpsert.mock.calls[0][0].create.method).toBe('GET');
    expect(mockUpsert.mock.calls[0][0].where.engagementId_canonicalUrl_method.method).toBe('GET');
  });

  it('passes contentLength 0 through (does not coerce to null)', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ id: 'ep-5' });
    const mockFindFirst = jest.fn().mockResolvedValue(null);

    const tx = {
      subdomain: { findFirst: mockFindFirst },
      endpoint: { upsert: mockUpsert },
    };

    const persister = new EndpointPersister({} as never);

    await persister.upsert(
      [{ url: 'https://example.com/empty', method: 'HEAD', statusCode: 200, contentLength: 0 }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    // contentLength: 0 ?? null === 0 (nullish coalescing preserves 0)
    expect(mockUpsert.mock.calls[0][0].create.contentLength).toBe(0);
    expect(mockUpsert.mock.calls[0][0].update.contentLength).toBe(0);
  });

  it('skips an endpoint whose URL host cannot be parsed (no throw)', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ id: 'ep-6' });
    const mockFindFirst = jest.fn().mockResolvedValue(null);

    const tx = {
      subdomain: { findFirst: mockFindFirst },
      endpoint: { upsert: mockUpsert },
    };

    const persister = new EndpointPersister({} as never);

    // "not a url" → canonicalizeUrl falls back to "not a url" (no scheme/host),
    // then new URL("not a url") throws → skip
    await expect(
      persister.upsert(
        [{ url: 'not a url', method: 'GET' }],
        makeCtx(),
        tx as unknown as Prisma.TransactionClient,
      ),
    ).resolves.toBe(0);

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('uses the injected tx client, not this.prisma', async () => {
    const prismaMock = {
      subdomain: { findFirst: jest.fn() },
      endpoint: { upsert: jest.fn() },
    };
    const txUpsert = jest.fn().mockResolvedValue({ id: 'ep-7' });
    const txFindFirst = jest.fn().mockResolvedValue(null);
    const tx = {
      subdomain: { findFirst: txFindFirst },
      endpoint: { upsert: txUpsert },
    };

    const persister = new EndpointPersister(prismaMock as never);

    await persister.upsert(
      [{ url: 'https://example.com/check' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(txUpsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.endpoint.upsert).not.toHaveBeenCalled();
  });

  it('falls back to this.prisma when no tx is passed', async () => {
    const prismaMock = {
      subdomain: { findFirst: jest.fn().mockResolvedValue(null) },
      endpoint: { upsert: jest.fn().mockResolvedValue({ id: 'ep-8' }) },
    };

    const persister = new EndpointPersister(prismaMock as never);

    const count = await persister.upsert([{ url: 'https://example.com/fallback' }], makeCtx());

    expect(count).toBe(1);
    expect(prismaMock.endpoint.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns the count of successfully persisted endpoints', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ id: 'ep-x' });
    const mockFindFirst = jest.fn().mockResolvedValue(null);

    const tx = {
      subdomain: { findFirst: mockFindFirst },
      endpoint: { upsert: mockUpsert },
    };

    const persister = new EndpointPersister({} as never);

    const count = await persister.upsert(
      [
        { url: 'https://example.com/a' },
        { url: 'https://example.com/b', method: 'POST' },
        { url: 'not a url' }, // skipped
      ],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(count).toBe(2);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });
});
