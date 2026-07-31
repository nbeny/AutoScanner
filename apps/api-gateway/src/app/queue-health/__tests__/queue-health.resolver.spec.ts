import { TOPICS } from '@autoscanner/messaging';

import { QueueHealthResolver } from '../queue-health.resolver';

/**
 * Kafka admin double. `fetchTopicOffsets` answers for main / .retry / .dlq topics,
 * `fetchOffsets` reports the consumer group's committed position.
 */
function makeKafka(opts: {
  high: number;
  low?: number;
  committed?: number;
  retryHigh?: number;
  dlqHigh?: number;
  members?: number;
}) {
  const { high, low = 0, committed = 0, retryHigh = 0, dlqHigh = 0, members = 1 } = opts;
  const admin = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    fetchTopicOffsets: jest.fn(async (topic: string) => {
      if (topic.endsWith('.retry')) return [{ partition: 0, low: '0', high: String(retryHigh) }];
      if (topic.endsWith('.dlq')) return [{ partition: 0, low: '0', high: String(dlqHigh) }];
      return [{ partition: 0, low: String(low), high: String(high) }];
    }),
    fetchOffsets: jest.fn(async () => [
      { topic: 't', partitions: [{ partition: 0, offset: String(committed) }] },
    ]),
    describeGroups: jest.fn(async () => ({
      groups: [{ members: new Array(members).fill({}) }],
    })),
  };
  return { kafka: { admin: () => admin } as never, admin };
}

describe('QueueHealthResolver (Kafka)', () => {
  it('returns one health row per SP0 topic', async () => {
    const { kafka } = makeKafka({ high: 0 });
    const rows = await new QueueHealthResolver(kafka).queueHealth();
    expect(rows).toHaveLength(Object.keys(TOPICS).length);
    expect(rows.map((r) => r.name)).toContain('security.scanner.requested');
  });

  it('reports consumer-group lag as `waiting`', async () => {
    const { kafka } = makeKafka({ high: 10, committed: 4 });
    const rows = await new QueueHealthResolver(kafka).queueHealth();
    expect(rows[0].waiting).toBe(6);
  });

  it('treats a never-committed group (-1) as nothing consumed yet', async () => {
    const { kafka } = makeKafka({ high: 7, low: 0, committed: -1 });
    const rows = await new QueueHealthResolver(kafka).queueHealth();
    expect(rows[0].waiting).toBe(7);
  });

  it('maps retry-topic depth to `delayed` and dlq depth to `failed`', async () => {
    const { kafka } = makeKafka({ high: 0, retryHigh: 3, dlqHigh: 2 });
    const rows = await new QueueHealthResolver(kafka).queueHealth();
    expect(rows[0].delayed).toBe(3);
    expect(rows[0].failed).toBe(2);
  });

  it('reports group members as `workers` and always disconnects the admin client', async () => {
    const { kafka, admin } = makeKafka({ high: 0, members: 2 });
    const rows = await new QueueHealthResolver(kafka).queueHealth();
    expect(rows[0].workers).toBe(2);
    expect(admin.disconnect).toHaveBeenCalled();
  });

  it('degrades to zeros when the broker refuses a metadata call', async () => {
    const { kafka, admin } = makeKafka({ high: 5 });
    admin.fetchTopicOffsets.mockRejectedValue(new Error('no broker'));
    const rows = await new QueueHealthResolver(kafka).queueHealth();
    expect(rows[0]).toMatchObject({ waiting: 0, delayed: 0, failed: 0 });
  });
});
