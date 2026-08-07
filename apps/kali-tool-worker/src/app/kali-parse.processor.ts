import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';
import { ConsumerRegistrar, MessageConsumer, type MessageContext } from '@autoscanner/messaging';
import type { KaliToolParsePayload } from '@autoscanner/queues';
import { KaliToolRunEventsPublisher } from './kali-tool-run-events.publisher';
import { parseToolOutput } from './parse/parse-tool-output';

const PARSE_TOPIC = 'security.kalitool.parse.requested';
const TERMINAL = new Set(['COMPLETED', 'FAILED']);

@Injectable()
export class KaliParseProcessor
  extends MessageConsumer<KaliToolParsePayload>
  implements OnApplicationBootstrap
{
  readonly topic = PARSE_TOPIC;
  private readonly logger = new Logger(KaliParseProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
    private readonly events: KaliToolRunEventsPublisher,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  async process(ctx: MessageContext<KaliToolParsePayload>): Promise<void> {
    const { runId, rawOutputKey } = ctx.payload;
    const run = await this.prisma.kaliToolRun.findUniqueOrThrow({ where: { id: runId } });
    if (TERMINAL.has(run.status)) {
      this.logger.log(`kaliToolRun=${runId} already ${run.status} — skip parse`);
      return;
    }

    await this.prisma.kaliToolRun.update({ where: { id: runId }, data: { status: 'PARSING' } });
    await this.events.publish(runId, { type: 'status', status: 'PARSING' });

    try {
      const obj = await this.storage.getObject('raw-outputs', rawOutputKey);
      const raw = Buffer.isBuffer(obj.body) ? obj.body.toString('utf8') : String(obj.body ?? '');
      const parsed = parseToolOutput(raw);

      await this.prisma.kaliToolRun.update({
        where: { id: runId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          outputFormat: parsed.format,
          parsedJson: parsed as unknown as object,
        },
      });
      await this.events.publish(runId, { type: 'status', status: 'COMPLETED' });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`kaliToolRun=${runId} parse failed: ${message}`);
      await this.prisma.kaliToolRun.update({
        where: { id: runId },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
      });
      await this.events.publish(runId, { type: 'error', message });
      throw err;
    }
  }
}
