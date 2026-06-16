import { QueueName } from '../queue-names';
import type { NvdSyncPayload, QueuePayloadMap } from '../job-payloads';

describe('NVD_SYNC queue wiring', () => {
  it('exposes the queue name and payload type', () => {
    expect(QueueName.NVD_SYNC).toBe('nvd-sync');
    const p: NvdSyncPayload = { mode: 'incremental' };
    const typed: QueuePayloadMap[typeof QueueName.NVD_SYNC] = p;
    expect(typed.mode).toBe('incremental');
    const full: NvdSyncPayload = { mode: 'full' };
    expect(full.mode).toBe('full');
  });
});
