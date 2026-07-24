import { Module } from '@nestjs/common';

import { ScanDispatcher } from './scan-dispatcher.service';

/**
 * Provides the {@link ScanDispatcher} to the AI orchestrator app.
 *
 * The Redis subscriber (`SCAN_DISPATCH_REDIS_SUBSCRIBER`) is NOT provided here:
 * a pub/sub subscriber must use its own connection, so the consumer app wires
 * an `ioredis` instance against the exported token (mirroring how
 * orchestrator-worker provides `ORCHESTRATOR_REDIS_SUBSCRIBER`). The queue
 * (`@InjectQueue(QueueName.SCAN_JOBS)`) and `PrismaService` / `ScannerRegistry`
 * likewise come from modules the consumer imports (QueuesModule, PrismaModule,
 * ScannerSdkModule).
 */
@Module({
  providers: [ScanDispatcher],
  exports: [ScanDispatcher],
})
export class ScanDispatchModule {}
