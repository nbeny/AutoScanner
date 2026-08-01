import { Prisma } from '@prisma/client';
import { FindingPersister } from '../persisters/finding-persister';

describe('FindingPersister.upsert', () => {
  it('uses the injected tx client when provided', async () => {
    const tx = {
      finding: { upsert: jest.fn().mockResolvedValue({ id: 'f1' }) },
    };
    const prisma = { finding: { upsert: jest.fn() } } as unknown as never;
    const prismaMock = prisma as unknown as { finding: { upsert: jest.Mock } };
    const persister = new FindingPersister(prisma);

    await persister.upsert(
      'job1',
      'asset1',
      {
        scannerName: 'nuclei',
        templateId: 'tpl',
        title: 'A finding',
        severity: 'HIGH',
        location: 'https://x',
        cveId: null,
        evidence: {},
      } as never,
      'x',
      tx as unknown as Prisma.TransactionClient,
    );

    expect(tx.finding.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.finding.upsert).not.toHaveBeenCalled();
  });

  it('falls back to this.prisma when no tx is passed', async () => {
    const prisma = { finding: { upsert: jest.fn().mockResolvedValue({ id: 'f1' }) } } as never;
    const persister = new FindingPersister(prisma);

    await persister.upsert(
      'job1',
      'asset1',
      {
        scannerName: 'nuclei',
        templateId: 'tpl',
        title: 't',
        severity: 'LOW',
        location: 'https://x',
        cveId: null,
        evidence: {},
      } as never,
      'x',
    );

    expect((prisma as { finding: { upsert: jest.Mock } }).finding.upsert).toHaveBeenCalledTimes(1);
  });
});
