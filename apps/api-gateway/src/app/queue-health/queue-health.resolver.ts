import { Inject, UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import type { Kafka } from 'kafkajs';

import { KAFKA, TOPICS, dlqTopic, retryTopic } from '@autoscanner/messaging';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QueueHealthObject } from './dto/queue-health.object';

/** Sums the message count across all partitions of a topic (high - low watermark). */
function totalMessages(offsets: Array<{ low: string; high: string }>): number {
  return offsets.reduce((sum, p) => sum + Math.max(0, Number(p.high) - Number(p.low)), 0);
}

@Resolver()
@UseGuards(JwtAuthGuard)
export class QueueHealthResolver {
  constructor(@Inject(KAFKA) private readonly kafka: Kafka) {}

  /**
   * Health per Kafka topic, mapped onto the pre-existing BullMQ-shaped contract so the
   * dashboard keeps working after the migration:
   *  - `waiting` = consumer-group lag on the main topic (undelivered work)
   *  - `delayed` = messages on the `.retry` topic (awaiting their availableAt)
   *  - `failed`  = messages on the `.dlq` topic
   *  - `workers` = live members of the consumer group
   *  - `active` / `completed` have no Kafka equivalent and stay 0.
   */
  @Query(() => [QueueHealthObject], { name: 'queueHealth' })
  async queueHealth(): Promise<QueueHealthObject[]> {
    const admin = this.kafka.admin();
    await admin.connect();
    try {
      return await Promise.all(
        Object.keys(TOPICS).map(async (topic) => {
          const [partitions, groupOffsets, described, retry, dlq] = await Promise.all([
            admin.fetchTopicOffsets(topic).catch(() => []),
            admin.fetchOffsets({ groupId: topic, topics: [topic] }).catch(() => []),
            admin.describeGroups([topic]).catch(() => ({ groups: [] })),
            admin.fetchTopicOffsets(retryTopic(topic)).catch(() => []),
            admin.fetchTopicOffsets(dlqTopic(topic)).catch(() => []),
          ]);

          const committed = new Map(
            (groupOffsets[0]?.partitions ?? []).map((p) => [p.partition, Number(p.offset)]),
          );
          const waiting = partitions.reduce((sum, p) => {
            const at = committed.get(p.partition);
            // A group that has never committed reports -1: treat it as "nothing consumed yet".
            const consumed = at === undefined || at < 0 ? Number(p.low) : at;
            return sum + Math.max(0, Number(p.high) - consumed);
          }, 0);

          return {
            name: topic,
            waiting,
            active: 0,
            completed: 0,
            failed: totalMessages(dlq),
            delayed: totalMessages(retry),
            workers: described.groups[0]?.members.length ?? 0,
          };
        }),
      );
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }
}
