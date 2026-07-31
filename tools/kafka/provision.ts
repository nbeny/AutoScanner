import { createKafka } from '../../libs/messaging/src/kafka/kafka-client';
import { provisionTopics } from '../../libs/messaging/src/kafka/provision';

async function main(): Promise<void> {
  const kafka = createKafka({
    KAFKA_BROKERS: process.env.KAFKA_BROKERS ?? 'localhost:19092',
    KAFKA_CLIENT_ID: (process.env.KAFKA_CLIENT_ID ?? 'autoscanner') + '-provision',
    KAFKA_SSL: process.env.KAFKA_SSL === 'true',
    KAFKA_SASL_MECHANISM: process.env.KAFKA_SASL_MECHANISM as
      | 'plain'
      | 'scram-sha-256'
      | 'scram-sha-512'
      | undefined,
    KAFKA_SASL_USERNAME: process.env.KAFKA_SASL_USERNAME,
    KAFKA_SASL_PASSWORD: process.env.KAFKA_SASL_PASSWORD,
  });
  const admin = kafka.admin();
  await admin.connect();
  await provisionTopics(admin, Number(process.env.KAFKA_REPLICATION_FACTOR ?? 1));
  await admin.disconnect();
  // eslint-disable-next-line no-console
  console.log('Kafka topics provisioned.');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
