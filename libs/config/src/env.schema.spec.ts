import { EnvSchema } from './env.schema';

describe('EnvSchema', () => {
  const validEnv = {
    NODE_ENV: 'development',
    API_PORT: '4000',
    API_HOST: '0.0.0.0',
    FRONTEND_URL: 'http://localhost:5173',
    JWT_SECRET: 'a'.repeat(64),
    ACCESS_TOKEN_TTL_SECONDS: '900',
    REFRESH_TOKEN_TTL_SECONDS: '2592000',
    MASTER_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    MONGODB_URL: 'mongodb://localhost:27017/x',
    REDIS_URL: 'redis://localhost:6379',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'a',
    S3_SECRET_KEY: 'b',
    LOG_LEVEL: 'info',
    LOG_PRETTY: 'true',
    OPERATOR_EMAIL: 'admin@local',
    OPERATOR_PASSWORD: 'changeme',
    PROMETHEUS_PORT: '9091',
  };

  it('parses valid env and coerces types', () => {
    const parsed = EnvSchema.parse(validEnv);
    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.LOG_PRETTY).toBe(true);
    expect(parsed.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
  });

  it('applies default for omitted numeric fields', () => {
    const { API_PORT: _omitted, ...withoutPort } = validEnv;
    const parsed = EnvSchema.parse(withoutPort);
    expect(parsed.API_PORT).toBe(4000);
  });

  it('rejects when JWT_SECRET is too short', () => {
    expect(() => EnvSchema.parse({ ...validEnv, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects when MASTER_ENCRYPTION_KEY is not 32 bytes base64', () => {
    expect(() => EnvSchema.parse({ ...validEnv, MASTER_ENCRYPTION_KEY: 'abc' })).toThrow(
      /MASTER_ENCRYPTION_KEY/,
    );
  });

  it('rejects MASTER_ENCRYPTION_KEY with non-base64 characters even if decoded length is 32', () => {
    // 32 'A's = 24 decoded bytes; padding wrong → rejected by length check. So construct
    // a string with valid-length decoded bytes but illegal chars:
    const bogus = '!'.repeat(44); // exclamation is not in base64 alphabet
    expect(() => EnvSchema.parse({ ...validEnv, MASTER_ENCRYPTION_KEY: bogus })).toThrow(
      /MASTER_ENCRYPTION_KEY/,
    );
  });

  it('rejects invalid NODE_ENV', () => {
    expect(() => EnvSchema.parse({ ...validEnv, NODE_ENV: 'banana' })).toThrow();
  });

  it('rejects invalid LOG_LEVEL', () => {
    expect(() => EnvSchema.parse({ ...validEnv, LOG_LEVEL: 'shouty' })).toThrow();
  });
});
