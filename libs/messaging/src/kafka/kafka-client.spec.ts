import { buildKafkaConfig } from './kafka-client';

describe('buildKafkaConfig', () => {
  it('splits brokers and sets clientId', () => {
    const cfg = buildKafkaConfig({
      KAFKA_BROKERS: 'a:1,b:2',
      KAFKA_CLIENT_ID: 'svc',
      KAFKA_SSL: false,
    });
    expect(cfg.brokers).toEqual(['a:1', 'b:2']);
    expect(cfg.clientId).toBe('svc');
    expect(cfg.ssl).toBe(false);
    expect(cfg.sasl).toBeUndefined();
  });

  it('trims and drops empty broker entries', () => {
    const cfg = buildKafkaConfig({
      KAFKA_BROKERS: ' a:1 , , b:2 ',
      KAFKA_CLIENT_ID: 'svc',
      KAFKA_SSL: false,
    });
    expect(cfg.brokers).toEqual(['a:1', 'b:2']);
  });

  it('adds sasl when mechanism present', () => {
    const cfg = buildKafkaConfig({
      KAFKA_BROKERS: 'a:1',
      KAFKA_CLIENT_ID: 'svc',
      KAFKA_SSL: true,
      KAFKA_SASL_MECHANISM: 'plain',
      KAFKA_SASL_USERNAME: 'u',
      KAFKA_SASL_PASSWORD: 'p',
    });
    expect(cfg.sasl).toEqual({ mechanism: 'plain', username: 'u', password: 'p' });
  });
});
