import { Consumer, Producer, Kafka } from 'kafkajs';
import { MAX_ATTEMPTS, nextAvailableAt } from '../backoff';
import { retryTopic, dlqTopic } from '../topics';
import { unwrap } from '../envelope';
import { MessageConsumer } from '../job-bus';
import { KafkaJobBus } from './kafka-job-bus';

export type Outcome =
  | { kind: 'retry'; topic: string; nextAttempt: number; availableAt: Date }
  | { kind: 'dlq'; topic: string };

export function decideOutcome(baseTopic: string, attempt: number, _err: Error, now: Date): Outcome {
  if (attempt >= MAX_ATTEMPTS) {
    return { kind: 'dlq', topic: dlqTopic(baseTopic) };
  }
  return {
    kind: 'retry',
    topic: retryTopic(baseTopic),
    nextAttempt: attempt + 1,
    availableAt: nextAvailableAt(attempt, now),
  };
}

export function isDue(availableAt: string | undefined, now: Date): boolean {
  if (!availableAt) return true;
  return new Date(availableAt).getTime() <= now.getTime();
}

/**
 * Runs one MessageConsumer against a base topic + its .retry topic.
 * - main topic: process; on throw -> decideOutcome -> publish to retry/dlq; always commit.
 * - retry topic: if not due, pause partition + seek back (re-consume later); if due, treat as main.
 */
export async function runConsumer(
  kafka: Kafka,
  producer: Producer,
  consumer: MessageConsumer,
): Promise<Consumer> {
  const base = consumer.topic;
  const bus = new KafkaJobBus(producer);
  const c = kafka.consumer({ groupId: base });
  await c.connect();
  await c.subscribe({ topic: base, fromBeginning: false });
  await c.subscribe({ topic: retryTopic(base), fromBeginning: false });

  await c.run({
    autoCommit: true,
    eachMessage: async ({ topic, partition, message }) => {
      const env = unwrap(message.value ?? Buffer.from('{}'));
      const now = new Date();

      if (topic === retryTopic(base) && !isDue(env.availableAt, now)) {
        // Not due yet: pause this partition and rewind so we re-read after the delay.
        c.pause([{ topic, partitions: [partition] }]);
        const waitMs = Math.max(0, new Date(env.availableAt as string).getTime() - now.getTime());
        setTimeout(
          () => {
            c.seek({ topic, partition, offset: message.offset });
            c.resume([{ topic, partitions: [partition] }]);
          },
          Math.min(waitMs, 30_000),
        );
        return;
      }

      try {
        await consumer.process({
          id: env.id,
          type: env.type,
          key: env.key,
          attempt: env.attempt,
          payload: env.payload,
        });
      } catch (err) {
        const outcome = decideOutcome(base, env.attempt, err as Error, now);
        if (outcome.kind === 'retry') {
          await bus.publish(outcome.topic, env.key, env.payload, {
            attempt: outcome.nextAttempt,
            availableAt: outcome.availableAt,
          });
        } else {
          await bus.publish(outcome.topic, env.key, env.payload, { attempt: env.attempt });
        }
      }
    },
  });
  return c;
}
