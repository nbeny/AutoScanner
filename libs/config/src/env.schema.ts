import { z } from 'zod';

const numericString = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : Number(v)))
    .refine((v) => v !== undefined && Number.isFinite(v), {
      message: 'must be a number',
    }) as unknown as z.ZodType<number>;

const booleanString = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

const base64Bytes = (length: number, field: string) =>
  z.string().refine(
    (v) => {
      if (!BASE64_RE.test(v)) return false;
      try {
        return Buffer.from(v, 'base64').length === length;
      } catch {
        return false;
      }
    },
    { message: `${field} must be ${length} bytes encoded as base64` },
  );

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),

  API_PORT: numericString(4000),
  API_HOST: z.string().default('0.0.0.0'),
  FRONTEND_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL_SECONDS: numericString(900),
  REFRESH_TOKEN_TTL_SECONDS: numericString(2_592_000),
  MASTER_ENCRYPTION_KEY: base64Bytes(32, 'MASTER_ENCRYPTION_KEY'),

  DATABASE_URL: z.string().url(),
  MONGODB_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: booleanString,

  OPERATOR_EMAIL: z.string().regex(/^[^\s@]+@[^\s@]+$/, 'Invalid email'),
  OPERATOR_PASSWORD: z.string().min(8),

  PROMETHEUS_PORT: numericString(9091),

  SMTP_URL: z.string().url().optional(),
  NOTIFICATIONS_FROM: z.string().optional(),

  WEBHOOK_GENERIC_TOKEN: z.string().optional(),
  WEBHOOK_ZAP_TOKEN: z.string().optional(),
  WEBHOOK_BURP_TOKEN: z.string().optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;
