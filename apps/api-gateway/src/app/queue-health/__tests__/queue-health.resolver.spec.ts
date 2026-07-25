import { QueueHealthResolver } from '../queue-health.resolver';

function fakeQueue(counts: Record<string, number>, workers: number) {
  return {
    getJobCounts: jest.fn().mockResolvedValue(counts),
    getWorkers: jest.fn().mockResolvedValue(new Array(workers).fill({})),
  } as any;
}

describe('QueueHealthResolver', () => {
  it('returns one health row per queue with counts and worker count', async () => {
    const q = fakeQueue({ waiting: 3, active: 1, completed: 10, failed: 2, delayed: 0 }, 2);
    const resolver = new QueueHealthResolver(q, q, q, q, q, q, q);
    const rows = await resolver.queueHealth();
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({
      name: 'scan-jobs',
      waiting: 3,
      active: 1,
      completed: 10,
      failed: 2,
      delayed: 0,
      workers: 2,
    });
  });

  it('degrades workers to 0 when getWorkers throws', async () => {
    const q = {
      getJobCounts: jest
        .fn()
        .mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }),
      getWorkers: jest.fn().mockRejectedValue(new Error('no conn')),
    } as any;
    const resolver = new QueueHealthResolver(q, q, q, q, q, q, q);
    const rows = await resolver.queueHealth();
    expect(rows[0].workers).toBe(0);
  });
});
