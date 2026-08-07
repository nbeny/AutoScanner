import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // TODO(kali-tool-runner): crash-recovery reconcile — re-enqueue any
  // KaliToolRun left in RUNNING/PARSING by a previous incarnation of this
  // worker (mirror scan-worker's `reconcileRunningScanJobs`). Not implemented
  // yet — no processors are registered until later tasks.

  // eslint-disable-next-line no-console
  console.log('kali-tool-worker started');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
