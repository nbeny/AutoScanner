# @autoscanner/config

Zod-validated environment configuration library for AutoScanner.

## Overview

Provides a global NestJS module (`AppConfigModule`) that parses and validates all environment
variables at application startup using a Zod schema. If any required variable is missing or
invalid, the application will refuse to start with a descriptive error message.

## Exports

| Symbol             | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `AppConfigModule`  | Global NestJS module — import once in `AppModule`     |
| `AppConfigService` | Injectable service exposing `env: AppEnv` and helpers |
| `EnvSchema`        | Zod schema for all environment variables              |
| `AppEnv`           | TypeScript type inferred from `EnvSchema`             |

## Usage

```typescript
// app.module.ts
import { AppConfigModule } from '@autoscanner/config';

@Module({ imports: [AppConfigModule] })
export class AppModule {}

// any.service.ts
import { AppConfigService } from '@autoscanner/config';

@Injectable()
export class AnyService {
  constructor(private readonly config: AppConfigService) {}

  doSomething() {
    const port = this.config.env.API_PORT; // number
    const isProd = this.config.isProd; // boolean
  }
}
```

## Required Environment Variables

| Variable                    | Type                                     | Default   | Description                  |
| --------------------------- | ---------------------------------------- | --------- | ---------------------------- |
| `NODE_ENV`                  | `development\|test\|production`          | —         | Runtime environment          |
| `API_PORT`                  | number                                   | `4000`    | HTTP server port             |
| `API_HOST`                  | string                                   | `0.0.0.0` | HTTP server bind address     |
| `FRONTEND_URL`              | URL                                      | —         | Allowed CORS origin          |
| `JWT_SECRET`                | string (min 32 chars)                    | —         | JWT signing secret           |
| `ACCESS_TOKEN_TTL_SECONDS`  | number                                   | `900`     | Access token TTL             |
| `REFRESH_TOKEN_TTL_SECONDS` | number                                   | `2592000` | Refresh token TTL            |
| `MASTER_ENCRYPTION_KEY`     | base64 (32 bytes)                        | —         | AES-256 master key           |
| `DATABASE_URL`              | URL                                      | —         | PostgreSQL connection string |
| `MONGODB_URL`               | URL                                      | —         | MongoDB connection string    |
| `REDIS_URL`                 | URL                                      | —         | Redis connection string      |
| `S3_ENDPOINT`               | URL                                      | —         | S3-compatible endpoint       |
| `S3_REGION`                 | string                                   | —         | S3 region                    |
| `S3_ACCESS_KEY`             | string                                   | —         | S3 access key                |
| `S3_SECRET_KEY`             | string                                   | —         | S3 secret key                |
| `LOG_LEVEL`                 | `trace\|debug\|info\|warn\|error\|fatal` | `info`    | Log level                    |
| `LOG_PRETTY`                | boolean string                           | `false`   | Enable pretty printing       |
| `OPERATOR_EMAIL`            | email                                    | —         | Bootstrap operator email     |
| `OPERATOR_PASSWORD`         | string (min 8)                           | —         | Bootstrap operator password  |
| `PROMETHEUS_PORT`           | number                                   | `9091`    | Prometheus metrics port      |

## Building

```bash
pnpm nx build config
```

## Testing

```bash
pnpm nx test config
```
