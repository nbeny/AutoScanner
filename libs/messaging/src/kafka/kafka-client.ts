import { Kafka, KafkaConfig } from 'kafkajs';

export interface KafkaEnv {
  KAFKA_BROKERS: string;
  KAFKA_CLIENT_ID: string;
  KAFKA_SSL: boolean;
  KAFKA_SASL_MECHANISM?: 'plain' | 'scram-sha-256' | 'scram-sha-512';
  KAFKA_SASL_USERNAME?: string;
  KAFKA_SASL_PASSWORD?: string;
}

export function buildKafkaConfig(env: KafkaEnv): KafkaConfig {
  const cfg: KafkaConfig = {
    clientId: env.KAFKA_CLIENT_ID,
    brokers: env.KAFKA_BROKERS.split(',')
      .map((b) => b.trim())
      .filter(Boolean),
    ssl: env.KAFKA_SSL,
  };
  if (env.KAFKA_SASL_MECHANISM) {
    cfg.sasl = {
      mechanism: env.KAFKA_SASL_MECHANISM,
      username: env.KAFKA_SASL_USERNAME ?? '',
      password: env.KAFKA_SASL_PASSWORD ?? '',
    } as KafkaConfig['sasl'];
  }
  return cfg;
}

export function createKafka(env: KafkaEnv): Kafka {
  return new Kafka(buildKafkaConfig(env));
}
