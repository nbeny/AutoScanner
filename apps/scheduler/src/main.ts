import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app/app.module';
import { ScheduleHydrator } from './app/schedule-hydrator.service';
import { CorrelationSweepScheduler } from './app/correlation-sweep.scheduler';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  app.get(ScheduleHydrator).start();
  app.get(CorrelationSweepScheduler).start();

  // eslint-disable-next-line no-console
  console.log('scheduler started');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
