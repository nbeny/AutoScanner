import { buildPinoOptions } from './logger.factory';

describe('buildPinoOptions', () => {
  it('returns pretty transport in dev with LOG_PRETTY=true', () => {
    const opts = buildPinoOptions({
      level: 'debug',
      pretty: true,
      env: 'development',
      appName: 'api-gateway',
    });
    expect(opts.level).toBe('debug');
    expect(opts.transport).toEqual({
      target: 'pino-pretty',
      options: { singleLine: true, translateTime: 'SYS:standard', colorize: true },
    });
    expect(opts.base).toEqual({ app: 'api-gateway', env: 'development' });
  });

  it('omits transport in production', () => {
    const opts = buildPinoOptions({
      level: 'info',
      pretty: false,
      env: 'production',
      appName: 'api-gateway',
    });
    expect(opts.transport).toBeUndefined();
    expect(opts.redact).toBeDefined();
  });

  it('redacts sensitive fields', () => {
    const opts = buildPinoOptions({
      level: 'info',
      pretty: false,
      env: 'production',
      appName: 'x',
    });
    expect((opts.redact as { paths: string[] }).paths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.passwordHash',
        '*.refreshToken',
        '*.refreshTokenHash',
        '*.accessToken',
        '*.token',
        '*.secret',
        '*.apiKey',
      ]),
    );
  });
});
