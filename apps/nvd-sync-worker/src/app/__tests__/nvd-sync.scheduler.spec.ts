import { NvdSyncScheduler } from '../nvd-sync.scheduler';

describe('NvdSyncScheduler', () => {
  it('publishes incremental and full NVD sync jobs when their cron windows are due', async () => {
    const bus = { publish: jest.fn().mockResolvedValue(undefined) };
    const scheduler = new NvdSyncScheduler(bus as never);
    scheduler.onApplicationBootstrap();

    // Force both schedules due, then run one tick.
    (scheduler as unknown as { nextIncremental: number; nextFull: number }).nextIncremental = 0;
    (scheduler as unknown as { nextIncremental: number; nextFull: number }).nextFull = 0;
    await (scheduler as unknown as { tick(): Promise<void> }).tick();

    expect(bus.publish).toHaveBeenCalledWith('security.nvd.sync.requested', 'incremental', {
      mode: 'incremental',
    });
    expect(bus.publish).toHaveBeenCalledWith('security.nvd.sync.requested', 'full', {
      mode: 'full',
    });

    scheduler.onModuleDestroy();
  });

  it('does not publish on bootstrap before any cron window is due', () => {
    const bus = { publish: jest.fn().mockResolvedValue(undefined) };
    const scheduler = new NvdSyncScheduler(bus as never);
    scheduler.onApplicationBootstrap();
    expect(bus.publish).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });
});
