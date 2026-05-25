import { LoggerOptions } from 'pino';

export interface BuildPinoOptionsInput {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  pretty: boolean;
  env: string;
  appName: string;
}

const REDACT_PATHS = [
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
];

export function buildPinoOptions(input: BuildPinoOptionsInput): LoggerOptions {
  const opts: LoggerOptions = {
    level: input.level,
    base: { app: input.appName, env: input.env },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: () => `,"ts":"${new Date().toISOString()}"`,
  };

  if (input.pretty) {
    opts.transport = {
      target: 'pino-pretty',
      options: { singleLine: true, translateTime: 'SYS:standard', colorize: true },
    };
  }

  return opts;
}
