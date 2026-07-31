import { createKafka } from './kafka-client';
import { KafkaJobBus } from './kafka-job-bus';
import { runConsumer } from './kafka-consumer.runner';
import { provisionTopics } from './provision';
import { MessageConsumer, MessageContext } from '../job-bus';

const ENV = {
  KAFKA_BROKERS: process.env['KAFKA_BROKERS'] ?? 'localhost:19092',
  KAFKA_CLIENT_ID: 'int-test',
  KAFKA_SSL: false,
} as const;

// Uses a real SP0 topic so provisioning covers it.
const TOPIC = 'security.report.requested';

describe('kafka roundtrip (requires dev:up)', () => {
  jest.setTimeout(40_000);

  it('delivers a published message to the consumer', async () => {
    const kafka = createKafka(ENV);
    const admin = kafka.admin();
    await admin.connect();
    await provisionTopics(admin, 1);
    await admin.disconnect();

    const producer = kafka.producer();
    await producer.connect();

    const seen: string[] = [];
    class Recorder extends MessageConsumer<{ reportId: string }> {
      readonly topic = TOPIC;
      async process(ctx: MessageContext<{ reportId: string }>): Promise<void> {
        seen.push(ctx.payload.reportId);
      }
    }
    const consumer = await runConsumer(kafka, producer, new Recorder());
    await new Promise((r) => setTimeout(r, 4000)); // group join

    const bus = new KafkaJobBus(producer);
    await bus.publish(TOPIC, 'r-int-1', { reportId: 'r-int-1' });

    // Poll for delivery up to ~10s.
    for (let i = 0; i < 20 && !seen.includes('r-int-1'); i++) {
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(seen).toContain('r-int-1');

    await consumer.disconnect();
    await producer.disconnect();
  });
});
