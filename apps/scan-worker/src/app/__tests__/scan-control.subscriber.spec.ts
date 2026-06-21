import { ScanControlSubscriber } from '../scan-control.subscriber';

describe('ScanControlSubscriber', () => {
  it('aborts the controller registered for a cancelled job', () => {
    const sub = new ScanControlSubscriber({ subscribe: jest.fn(), on: jest.fn() } as any);
    const ctrl = new AbortController();
    sub.register('job_1', ctrl);
    sub.handleMessage(JSON.stringify({ type: 'CANCEL', scanJobId: 'job_1' }));
    expect(ctrl.signal.aborted).toBe(true);
  });

  it('ignores cancel for unknown jobs and malformed messages', () => {
    const sub = new ScanControlSubscriber({ subscribe: jest.fn(), on: jest.fn() } as any);
    expect(() =>
      sub.handleMessage(JSON.stringify({ type: 'CANCEL', scanJobId: 'nope' })),
    ).not.toThrow();
    expect(() => sub.handleMessage('not json')).not.toThrow();
  });
});
