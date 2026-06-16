import { NvdSyncScheduler } from '../nvd-sync.scheduler';

describe('NvdSyncScheduler', () => {
  it('registers incremental (daily) and full (weekly) repeatable jobs on bootstrap', async () => {
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const scheduler = new NvdSyncScheduler(queue as never);
    await scheduler.onApplicationBootstrap();
    const calls = queue.add.mock.calls;
    expect(calls).toContainEqual([
      'nvd-sync',
      { mode: 'incremental' },
      expect.objectContaining({
        repeat: expect.objectContaining({ pattern: expect.any(String) }),
        jobId: 'nvd-sync-incremental',
      }),
    ]);
    expect(calls).toContainEqual([
      'nvd-sync',
      { mode: 'full' },
      expect.objectContaining({
        repeat: expect.objectContaining({ pattern: expect.any(String) }),
        jobId: 'nvd-sync-full',
      }),
    ]);
  });
});
