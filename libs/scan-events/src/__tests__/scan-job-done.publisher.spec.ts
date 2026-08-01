import { ScanJobDonePublisher } from '../scan-job-done.publisher';
import { scanJobDoneChannel } from '../channel';

function harness() {
  const publish = jest.fn().mockResolvedValue(1);
  const pub = new ScanJobDonePublisher({ publish } as never);
  return { pub, publish };
}

describe('ScanJobDonePublisher.publishDone', () => {
  it('publishes {scanJobId,status} to the scanjob:done channel', async () => {
    const { pub, publish } = harness();

    await pub.publishDone('job_1', 'COMPLETED');

    expect(publish).toHaveBeenCalledWith(
      scanJobDoneChannel('job_1'),
      JSON.stringify({ scanJobId: 'job_1', status: 'COMPLETED' }),
    );
  });

  it('never throws when Redis publish fails (the fallback poll covers a lost wake-up)', async () => {
    const { pub, publish } = harness();
    publish.mockRejectedValue(new Error('redis down'));

    await expect(pub.publishDone('job_1', 'FAILED')).resolves.toBeUndefined();
  });
});

describe('scanJobDoneChannel', () => {
  it('namespaces by scanJobId', () => {
    expect(scanJobDoneChannel('abc')).toBe('scanjob:done:abc');
  });
});
