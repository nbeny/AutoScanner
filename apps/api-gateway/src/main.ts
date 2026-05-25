import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppConfigService } from '@autoscanner/config';

import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const cfg = app.get(AppConfigService);
  app.enableCors({ origin: cfg.env.FRONTEND_URL, credentials: true });

  app.enableShutdownHooks();

  await app.listen(cfg.env.API_PORT, cfg.env.API_HOST);
  // eslint-disable-next-line no-console
  console.log(`api-gateway listening on http://${cfg.env.API_HOST}:${cfg.env.API_PORT}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
