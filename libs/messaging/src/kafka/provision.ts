import { Admin } from 'kafkajs';
import { allProvisionSpecs } from '../topics';

export async function provisionTopics(admin: Admin, replicationFactor = 1): Promise<void> {
  const existing = new Set(await admin.listTopics());
  const topics = allProvisionSpecs()
    .filter((s) => !existing.has(s.topic))
    .map((s) => ({ topic: s.topic, numPartitions: s.partitions, replicationFactor }));
  if (topics.length) {
    await admin.createTopics({ topics, waitForLeaders: true });
  }
}
