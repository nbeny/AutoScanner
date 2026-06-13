import type { Prisma } from '@prisma/client';
import { OrgMetadataPersister } from '../org-metadata-persister';

const makeCtx = (overrides: Partial<{ engagementId: string; scannerName: string }> = {}) => ({
  engagementId: 'eng-1',
  scannerName: 'whois',
  scanJobId: 'job-1',
  target: 'example.com',
  ...overrides,
});

describe('OrgMetadataPersister.upsert', () => {
  it('keys the upsert by engagementId_kind_source and passes data through on create+update', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ id: 'om-1' });
    const tx = { orgMetadata: { upsert: mockUpsert } };
    const data = { Registrar: 'Example Registrar, LLC' };

    const persister = new OrgMetadataPersister({} as never);
    await persister.upsert(
      [{ kind: 'WHOIS', data }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const args = mockUpsert.mock.calls[0][0];
    expect(args.where.engagementId_kind_source).toEqual({
      engagementId: 'eng-1',
      kind: 'WHOIS',
      source: 'whois',
    });
    expect(args.create).toEqual({
      engagementId: 'eng-1',
      kind: 'WHOIS',
      data,
      source: 'whois',
    });
    expect(args.update.data).toEqual(data);
    expect(args.update.lastSeenAt).toBeInstanceOf(Date);
  });

  it('uses the injected tx client, not this.prisma', async () => {
    const prismaMock = { orgMetadata: { upsert: jest.fn() } };
    const txUpsert = jest.fn().mockResolvedValue({ id: 'om-2' });
    const tx = { orgMetadata: { upsert: txUpsert } };

    const persister = new OrgMetadataPersister(prismaMock as never);
    await persister.upsert(
      [{ kind: 'ORG', data: { a: 1 } }],
      makeCtx({ scannerName: 'shodan' }),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(txUpsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.orgMetadata.upsert).not.toHaveBeenCalled();
  });

  it('returns the count of persisted records', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ id: 'om-x' });
    const tx = { orgMetadata: { upsert: mockUpsert } };

    const persister = new OrgMetadataPersister({} as never);
    const count = await persister.upsert(
      [
        { kind: 'WHOIS', data: { a: 1 } },
        { kind: 'ORG', data: { b: 2 } },
      ],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(count).toBe(2);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });
});
