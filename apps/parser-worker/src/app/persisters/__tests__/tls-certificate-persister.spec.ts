import type { Prisma } from '@prisma/client';
import { TlsCertificatePersister } from '../tls-certificate-persister';

const makeCtx = (overrides: Partial<{ engagementId: string; scannerName: string }> = {}) => ({
  engagementId: 'eng-1',
  scannerName: 'tlsx',
  scanJobId: 'job-1',
  target: 'example.com',
  ...overrides,
});

const makeTx = (
  overrides: Partial<{
    subdomainFindFirst: jest.Mock;
    tlsCertificateUpsert: jest.Mock;
  }> = {},
) => {
  const subdomainFindFirst = overrides.subdomainFindFirst ?? jest.fn().mockResolvedValue(null);
  const tlsCertificateUpsert =
    overrides.tlsCertificateUpsert ?? jest.fn().mockResolvedValue({ id: 'tls-1' });
  return {
    subdomain: { findFirst: subdomainFindFirst },
    tlsCertificate: { upsert: tlsCertificateUpsert },
  };
};

describe('TlsCertificatePersister.upsert', () => {
  it('uses compound key engagementId_fingerprintSha256_host and lowercases host', async () => {
    const tx = makeTx();
    const persister = new TlsCertificatePersister({} as never);

    await persister.upsert(
      [{ host: 'API.Example.COM', fingerprintSha256: 'abc123' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(tx.tlsCertificate.upsert).toHaveBeenCalledTimes(1);
    const args = tx.tlsCertificate.upsert.mock.calls[0][0];
    expect(args.where.engagementId_fingerprintSha256_host).toEqual({
      engagementId: 'eng-1',
      fingerprintSha256: 'abc123',
      host: 'api.example.com',
    });
    expect(args.create.host).toBe('api.example.com');
  });

  it('resolves subdomainId when subdomain exists, null otherwise', async () => {
    const subdomainFindFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'subdomain-42' })
      .mockResolvedValueOnce(null);

    const tlsCertificateUpsert = jest.fn().mockResolvedValue({ id: 'tls-x' });
    const tx = {
      subdomain: { findFirst: subdomainFindFirst },
      tlsCertificate: { upsert: tlsCertificateUpsert },
    };

    const persister = new TlsCertificatePersister({} as never);
    await persister.upsert(
      [
        { host: 'api.example.com', fingerprintSha256: 'fp1' },
        { host: 'www.example.com', fingerprintSha256: 'fp2' },
      ],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    const [call1, call2] = tlsCertificateUpsert.mock.calls;
    expect(call1[0].create.subdomainId).toBe('subdomain-42');
    expect(call2[0].create.subdomainId).toBeNull();
  });

  it('defaults subjectAn to [] when undefined', async () => {
    const tx = makeTx();
    const persister = new TlsCertificatePersister({} as never);

    await persister.upsert(
      [{ host: 'example.com', fingerprintSha256: 'fp1' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    const args = tx.tlsCertificate.upsert.mock.calls[0][0];
    expect(args.create.subjectAn).toEqual([]);
  });

  it('passes through subjectAn when provided', async () => {
    const tx = makeTx();
    const persister = new TlsCertificatePersister({} as never);

    await persister.upsert(
      [
        {
          host: 'example.com',
          fingerprintSha256: 'fp1',
          subjectAn: ['*.example.com', 'example.com'],
        },
      ],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    const args = tx.tlsCertificate.upsert.mock.calls[0][0];
    expect(args.create.subjectAn).toEqual(['*.example.com', 'example.com']);
  });

  it('converts valid ISO date strings to Date objects for notBefore/notAfter', async () => {
    const tx = makeTx();
    const persister = new TlsCertificatePersister({} as never);

    await persister.upsert(
      [
        {
          host: 'example.com',
          fingerprintSha256: 'fp1',
          notBefore: '2023-01-01T00:00:00Z',
          notAfter: '2024-01-01T00:00:00Z',
        },
      ],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    const args = tx.tlsCertificate.upsert.mock.calls[0][0];
    expect(args.create.notBefore).toEqual(new Date('2023-01-01T00:00:00Z'));
    expect(args.create.notAfter).toEqual(new Date('2024-01-01T00:00:00Z'));
    expect(args.update.notAfter).toEqual(new Date('2024-01-01T00:00:00Z'));
  });

  it('converts absent notBefore/notAfter to null', async () => {
    const tx = makeTx();
    const persister = new TlsCertificatePersister({} as never);

    await persister.upsert(
      [{ host: 'example.com', fingerprintSha256: 'fp1' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    const args = tx.tlsCertificate.upsert.mock.calls[0][0];
    expect(args.create.notBefore).toBeNull();
    expect(args.create.notAfter).toBeNull();
    expect(args.update.notAfter).toBeNull();
  });

  it('converts invalid date strings to null', async () => {
    const tx = makeTx();
    const persister = new TlsCertificatePersister({} as never);

    await persister.upsert(
      [
        {
          host: 'example.com',
          fingerprintSha256: 'fp1',
          notBefore: 'not-a-date',
          notAfter: 'also-invalid',
        },
      ],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    const args = tx.tlsCertificate.upsert.mock.calls[0][0];
    expect(args.create.notBefore).toBeNull();
    expect(args.create.notAfter).toBeNull();
  });

  it('skips cert with no fingerprintSha256 and returns 0', async () => {
    const tx = makeTx();
    const persister = new TlsCertificatePersister({} as never);

    const count = await persister.upsert(
      [{ host: 'example.com', fingerprintSha256: '' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(count).toBe(0);
    expect(tx.tlsCertificate.upsert).not.toHaveBeenCalled();
  });

  it('skips cert with no host and returns 0', async () => {
    const tx = makeTx();
    const persister = new TlsCertificatePersister({} as never);

    const count = await persister.upsert(
      [{ host: '', fingerprintSha256: 'fp1' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(count).toBe(0);
    expect(tx.tlsCertificate.upsert).not.toHaveBeenCalled();
  });

  it('uses tx client instead of this.prisma', async () => {
    const prismaMock = {
      subdomain: { findFirst: jest.fn() },
      tlsCertificate: { upsert: jest.fn() },
    };
    const txUpsert = jest.fn().mockResolvedValue({ id: 'tls-tx' });
    const tx = {
      subdomain: { findFirst: jest.fn().mockResolvedValue(null) },
      tlsCertificate: { upsert: txUpsert },
    };

    const persister = new TlsCertificatePersister(prismaMock as never);
    await persister.upsert(
      [{ host: 'example.com', fingerprintSha256: 'fp1' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(txUpsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.tlsCertificate.upsert).not.toHaveBeenCalled();
  });

  it('returns the count of successfully upserted certificates', async () => {
    const tx = makeTx();
    const persister = new TlsCertificatePersister({} as never);

    const count = await persister.upsert(
      [
        { host: 'a.example.com', fingerprintSha256: 'fp1' },
        { host: '', fingerprintSha256: 'fp2' }, // skipped — no host
        { host: 'b.example.com', fingerprintSha256: '' }, // skipped — no fingerprint
        { host: 'c.example.com', fingerprintSha256: 'fp3' },
      ],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(count).toBe(2);
    expect(tx.tlsCertificate.upsert).toHaveBeenCalledTimes(2);
  });
});
