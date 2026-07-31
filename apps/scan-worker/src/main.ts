import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { PrismaService } from '@autoscanner/database';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';

import { AppModule } from './app/app.module';
import { reconcileRunningScanJobs } from './app/reconcile';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // Crash-recovery: any ScanJob left in RUNNING by a previous incarnation
  // of this worker needs to be re-enqueued. The processor re-runs Docker
  // from scratch and overwrites the previous attempt's raw output at the
  // same key, so re-enqueuing is safe.
  const prisma = app.get(PrismaService);
  const bus = app.get<JobBus>(JOB_BUS);
  await reconcileRunningScanJobs(prisma, bus);

  // eslint-disable-next-line no-console
  console.log('scan-worker started');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
