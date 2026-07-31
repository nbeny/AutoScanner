import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type OnModuleDestroy,
  type Provider,
} from '@nestjs/common';
import type { Consumer, Kafka, Producer } from 'kafkajs';
import { AppConfigService } from '@autoscanner/config';
import { createKafka } from './kafka/kafka-client';
import { KafkaJobBus } from './kafka/kafka-job-bus';
import { runConsumer } from './kafka/kafka-consumer.runner';
import { JOB_BUS, type MessageConsumer } from './job-bus';

export const KAFKA = Symbol('KAFKA');
export const KAFKA_PRODUCER = Symbol('KAFKA_PRODUCER');

/**
 * Runs `MessageConsumer`s as Kafka consumers and tears them down on shutdown. A migrated
 * worker injects this and calls `register(this)` for its consumer(s) in an
 * `OnApplicationBootstrap` hook.
 */
@Injectable()
export class ConsumerRegistrar implements OnModuleDestroy {
  private readonly logger = new Logger(ConsumerRegistrar.name);
  private readonly consumers: Consumer[] = [];

  constructor(
    @Inject(KAFKA) private readonly kafka: Kafka,
    @Inject(KAFKA_PRODUCER) private readonly producer: Producer,
  ) {}

  async register(consumer: MessageConsumer): Promise<void> {
    const c = await runConsumer(this.kafka, this.producer, consumer);
    this.consumers.push(c);
    this.logger.log(`kafka consumer running for topic ${consumer.topic}`);
  }

  async onModuleDestroy(): Promise<void> {
    for (const c of this.consumers) {
      try {
        await c.disconnect();
      } catch {
        /* best-effort shutdown */
      }
    }
  }
}

@Injectable()
class KafkaProducerLifecycle implements OnModuleDestroy {
  constructor(@Inject(KAFKA_PRODUCER) private readonly producer: Producer) {}

  async onModuleDestroy(): Promise<void> {
    try {
      await this.producer.disconnect();
    } catch {
      /* best-effort shutdown */
    }
  }
}

/**
 * Global messaging module. Provides a connected Kafka producer, the `JOB_BUS` publisher, and
 * the `ConsumerRegistrar`. Import via `MessagingModule.forRoot()` in each migrated worker.
 */
@Global()
@Module({})
export class MessagingModule {
  static forRoot(): DynamicModule {
    const kafkaProvider: Provider = {
      provide: KAFKA,
      useFactory: (cfg: AppConfigService) => createKafka(cfg.env),
      inject: [AppConfigService],
    };
    const producerProvider: Provider = {
      provide: KAFKA_PRODUCER,
      useFactory: async (kafka: Kafka) => {
        const producer = kafka.producer();
        await producer.connect();
        return producer;
      },
      inject: [KAFKA],
    };
    const jobBusProvider: Provider = {
      provide: JOB_BUS,
      useFactory: (producer: Producer) => new KafkaJobBus(producer),
      inject: [KAFKA_PRODUCER],
    };
    return {
      module: MessagingModule,
      providers: [
        kafkaProvider,
        producerProvider,
        jobBusProvider,
        KafkaProducerLifecycle,
        ConsumerRegistrar,
      ],
      exports: [JOB_BUS, KAFKA, KAFKA_PRODUCER, ConsumerRegistrar],
    };
  }
}
