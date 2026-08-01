import type { Prisma } from '@prisma/client';
import { EmailPersister } from '../email-persister';

const makeCtx = (overrides: Partial<{ engagementId: string; scannerName: string }> = {}) => ({
  engagementId: 'eng-1',
  scannerName: 'whois',
  scanJobId: 'job-1',
  target: 'example.com',
  ...overrides,
});

describe('EmailPersister.upsert', () => {
  it('lowercases + trims the address and keys the upsert by engagementId_address', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ id: 'em-1' });
    const tx = { email: { upsert: mockUpsert } };

    const persister = new EmailPersister({} as never);
    await persister.upsert(
      [{ address: '  Admin@Example.COM ' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const args = mockUpsert.mock.calls[0][0];
    expect(args.where.engagementId_address).toEqual({
      engagementId: 'eng-1',
      address: 'admin@example.com',
    });
    expect(args.create).toEqual({
      engagementId: 'eng-1',
      address: 'admin@example.com',
      source: 'whois',
    });
    expect(args.update.lastSeenAt).toBeInstanceOf(Date);
  });

  it('skips empty/whitespace addresses', async () => {
    const mockUpsert = jest.fn();
    const tx = { email: { upsert: mockUpsert } };

    const persister = new EmailPersister({} as never);
    const count = await persister.upsert(
      [{ address: '   ' }, { address: '' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(count).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('uses the injected tx client, not this.prisma', async () => {
    const prismaMock = { email: { upsert: jest.fn() } };
    const txUpsert = jest.fn().mockResolvedValue({ id: 'em-2' });
    const tx = { email: { upsert: txUpsert } };

    const persister = new EmailPersister(prismaMock as never);
    await persister.upsert(
      [{ address: 'a@b.com' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(txUpsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.email.upsert).not.toHaveBeenCalled();
  });

  it('returns the count of persisted emails (deduped inputs still count per row)', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ id: 'em-x' });
    const tx = { email: { upsert: mockUpsert } };

    const persister = new EmailPersister({} as never);
    const count = await persister.upsert(
      [{ address: 'a@b.com' }, { address: 'c@d.com' }, { address: '  ' }],
      makeCtx(),
      tx as unknown as Prisma.TransactionClient,
    );

    expect(count).toBe(2);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });
});
