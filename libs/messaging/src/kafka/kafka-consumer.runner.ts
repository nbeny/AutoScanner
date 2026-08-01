import { Logger } from '@nestjs/common';
import { Consumer, Producer, Kafka } from 'kafkajs';
import { MAX_ATTEMPTS, nextAvailableAt } from '../backoff';
import { retryTopic, dlqTopic } from '../topics';
import { unwrap } from '../envelope';
import { MessageConsumer } from '../job-bus';
import { KafkaJobBus } from './kafka-job-bus';

export type Outcome =
  | { kind: 'retry'; topic: string; nextAttempt: number; availableAt: Date }
  | { kind: 'dlq'; topic: string };

/**
 * Thrown by a consumer that hit an upstream rate limit and knows when to come back
 * (e.g. an HTTP `Retry-After`). The message is re-driven at that time **without**
 * consuming an attempt, so a rate limit never exhausts the retry budget or lands in
 * the DLQ. Replaces the BullMQ per-job `delay` self-reschedule.
 */
export class RetryAfterError extends Error {
  constructor(public readonly delayMs: number) {
    super(`retry after ${delayMs}ms`);
    this.name = 'RetryAfterError';
  }
}

export function decideOutcome(baseTopic: string, attempt: number, err: Error, now: Date): Outcome {
  if (err instanceof RetryAfterError) {
    return {
      kind: 'retry',
      topic: retryTopic(baseTopic),
      nextAttempt: attempt,
      availableAt: new Date(now.getTime() + err.delayMs),
    };
  }
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
  // Group defaults to the topic (one owning consumer per queue); a consumer overrides it when
  // several services fan out from the same topic and each needs the full stream.
  const groupId = consumer.groupId ?? base;
  const logger = new Logger('KafkaConsumer');
  const bus = new KafkaJobBus(producer);
  const c = kafka.consumer({ groupId });
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
        const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
        if (outcome.kind === 'retry') {
          // A rate-limit re-drive is expected traffic, not a failure: log it quietly.
          const retryLog =
            err instanceof RetryAfterError
              ? `${base} key=${env.key} rate-limited, re-driving at ${outcome.availableAt.toISOString()}`
              : `${base} key=${env.key} attempt ${env.attempt} failed, retrying at ${outcome.availableAt.toISOString()}: ${reason}`;
          if (err instanceof RetryAfterError) logger.log(retryLog);
          else logger.warn(retryLog);
          await bus.publish(outcome.topic, env.key, env.payload, {
            attempt: outcome.nextAttempt,
            availableAt: outcome.availableAt,
          });
        } else {
          logger.error(
            `${base} key=${env.key} exhausted ${env.attempt} attempts, routing to DLQ: ${reason}`,
          );
          await bus.publish(outcome.topic, env.key, env.payload, { attempt: env.attempt });
        }
      }
    },
  });
  return c;
}
