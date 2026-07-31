import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { PrismaService } from '@autoscanner/database';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';

import { AppModule } from './app/app.module';
import { reconcileRunningTemplateRuns } from './app/reconcile';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // Crash-recovery: any TemplateRun left in RUNNING by a previous incarnation
  // of this worker (or by an ungraceful shutdown) needs to be re-enqueued.
  // The processor reads `run.currentStepIndex` and resumes from the last
  // attempted step, so re-enqueuing is idempotent and safe.
  const prisma = app.get(PrismaService);
  const bus = app.get<JobBus>(JOB_BUS);
  await reconcileRunningTemplateRuns(prisma, bus);

  // eslint-disable-next-line no-console
  console.log('orchestrator-worker started');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
