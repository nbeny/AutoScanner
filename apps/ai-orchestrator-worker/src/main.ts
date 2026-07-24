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

  // TODO(task-3.x): crash-recovery reconcile — re-enqueue any AiRun left in
  // RUNNING by a previous incarnation of this worker (mirror
  // orchestrator-worker's `reconcileRunningTemplateRuns`). Not implemented yet.

  // eslint-disable-next-line no-console
  console.log('ai-orchestrator-worker started');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
