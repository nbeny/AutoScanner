import type { Prisma } from '@prisma/client';
import { PortPersister } from '../persisters/port-persister';

describe('PortPersister.upsert', () => {
  it('uses tx when provided and returns the port id', async () => {
    const tx = {
      port: { upsert: jest.fn().mockResolvedValue({ id: 'p1' }) },
    };
    const persister = new PortPersister({ port: { upsert: jest.fn() } } as never);
    const id = await persister.upsert(
      'a1',
      { number: 22, protocol: 'TCP', state: 'OPEN' } as never,
      tx as unknown as Prisma.TransactionClient,
    );
    expect(id).toBe('p1');
    expect(tx.port.upsert).toHaveBeenCalledTimes(1);
  });
});
