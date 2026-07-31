import { Global, Module, DynamicModule } from '@nestjs/common';

export type Backend = 'bullmq' | 'kafka';

/**
 * Resolves the messaging backend for a given topic: a per-topic override in
 * `overrides` (comma-separated `<topic>=kafka|bullmq`) wins over `globalDefault`.
 */
export function resolveBackend(topic: string, globalDefault: Backend, overrides: string): Backend {
  for (const pair of overrides
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [t, b] = pair.split('=');
    if (t === topic && (b === 'kafka' || b === 'bullmq')) return b;
  }
  return globalDefault;
}

/**
 * Global messaging module.
 *
 * The concrete `JOB_BUS` provider (a composite that delegates per-topic to either
 * `KafkaJobBus` — over a shared connected `Producer` from `createKafka(env)` — or the
 * transitional `BullMqJobBus`) plus the `registerConsumer(consumer)` runtime (which calls
 * `runConsumer(kafka, producer, consumer)` when the topic resolves to `kafka`, and otherwise
 * leaves the existing `@Processor` in place) are wired here as each app is cut over. The
 * wiring is added in the first cutover task (T13), where a concrete app supplies its Kafka
 * producer and any remaining legacy BullMQ routes.
 */
@Global()
@Module({})
export class MessagingModule {
  static forRoot(): DynamicModule {
    return { module: MessagingModule, providers: [], exports: [] };
  }
}
