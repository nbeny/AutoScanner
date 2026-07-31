import { JOB_BUS, MessageConsumer, MessageContext } from './job-bus';

class TestConsumer extends MessageConsumer<{ n: number }> {
  readonly topic = 'security.report.requested';
  handled: number[] = [];
  async process(ctx: MessageContext<{ n: number }>): Promise<void> {
    this.handled.push(ctx.payload.n);
  }
}

describe('job-bus contract', () => {
  it('exposes a DI token', () => {
    expect(typeof JOB_BUS).toBe('symbol');
  });

  it('MessageConsumer subclasses declare a topic and process()', async () => {
    const c = new TestConsumer();
    await c.process({ key: 'k', payload: { n: 7 }, attempt: 1, id: 'x', type: c.topic });
    expect(c.handled).toEqual([7]);
  });
});
