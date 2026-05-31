import type { Prisma } from '@prisma/client';
import { ServicePersister } from '../persisters/service-persister';

describe('ServicePersister.upsert', () => {
  it('uses tx when provided (existing service path)', async () => {
    const tx = {
      service: {
        findFirst: jest.fn().mockResolvedValue({ id: 's1' }),
        update: jest.fn().mockResolvedValue({ id: 's1' }),
        create: jest.fn(),
      },
    };
    const persister = new ServicePersister({ service: {} } as never);

    await persister.upsert(
      'p1',
      { name: 'http', product: null, version: null, extraInfo: null, cpe: [] } as never,
      tx as unknown as Prisma.TransactionClient,
    );

    expect(tx.service.update).toHaveBeenCalledTimes(1);
    expect(tx.service.create).not.toHaveBeenCalled();
  });
});
