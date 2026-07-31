import { Producer } from 'kafkajs';
import { JobBus, PublishOpts } from '../job-bus';
import { wrap } from '../envelope';

export class KafkaJobBus implements JobBus {
  constructor(private readonly producer: Producer) {}

  async publish<T>(topic: string, key: string, payload: T, opts: PublishOpts = {}): Promise<void> {
    const env = wrap(topic, key, payload, { attempt: opts.attempt, availableAt: opts.availableAt });
    await this.producer.send({
      topic,
      messages: [{ key, value: Buffer.from(JSON.stringify(env)) }],
    });
  }
}
