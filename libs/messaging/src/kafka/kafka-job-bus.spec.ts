import { KafkaJobBus } from './kafka-job-bus';

function fakeProducer() {
  const sent: any[] = [];
  return {
    sent,
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    send: jest.fn(async (rec: any) => {
      sent.push(rec);
    }),
  };
}

describe('KafkaJobBus', () => {
  it('publishes an enveloped, keyed message to the topic', async () => {
    const p = fakeProducer();
    const bus = new KafkaJobBus(p as any);
    await bus.publish('security.report.requested', 'r1', { reportId: 'r1' });
    expect(p.sent).toHaveLength(1);
    expect(p.sent[0].topic).toBe('security.report.requested');
    const msg = p.sent[0].messages[0];
    expect(msg.key).toBe('r1');
    const env = JSON.parse(msg.value.toString());
    expect(env.payload.reportId).toBe('r1');
    expect(env.attempt).toBe(1);
  });

  it('publishes with availableAt + attempt when opts provided', async () => {
    const p = fakeProducer();
    const bus = new KafkaJobBus(p as any);
    const when = new Date(Date.now() + 30_000);
    await bus.publish(
      'security.report.requested.retry',
      'r1',
      { reportId: 'r1' },
      { attempt: 2, availableAt: when },
    );
    const env = JSON.parse(p.sent[0].messages[0].value.toString());
    expect(env.attempt).toBe(2);
    expect(new Date(env.availableAt).getTime()).toBe(when.getTime());
  });
});
