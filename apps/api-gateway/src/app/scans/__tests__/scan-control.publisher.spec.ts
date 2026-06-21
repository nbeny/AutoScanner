import { ScanControlPublisher } from '../scan-control.publisher';
import { SCAN_CONTROL_CHANNEL } from '@autoscanner/queues';

describe('ScanControlPublisher', () => {
  it('publishes a cancel message for a scan job', async () => {
    const redis = { publish: jest.fn().mockResolvedValue(1) } as any;
    const pub = new ScanControlPublisher(redis);
    await pub.publishCancel('job_42');
    expect(redis.publish).toHaveBeenCalledWith(
      SCAN_CONTROL_CHANNEL,
      JSON.stringify({ type: 'CANCEL', scanJobId: 'job_42' }),
    );
  });
});
