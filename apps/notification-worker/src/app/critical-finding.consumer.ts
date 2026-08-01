import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConsumerRegistrar, MessageConsumer, type MessageContext } from '@autoscanner/messaging';
import { NotificationsFanoutService, NotificationEventType } from '@autoscanner/notifications';

interface FindingCreatedPayload {
  scanJobId: string;
  engagementId: string;
  assetId?: string;
  findingId?: string;
  title?: string;
  severity?: string;
  cveId?: string | null;
}

/**
 * SP5a — produces the previously-stub `FINDING_CRITICAL` alert. Consumes `security.finding.created`
 * on its OWN consumer group (so it runs alongside threat-intel and compliance, each getting every
 * event) and fans out only CRITICAL findings. Non-critical findings are ignored — the fan-out
 * itself further filters to owners who subscribed a channel to FINDING_CRITICAL, so this is not a
 * per-finding firehose.
 */
@Injectable()
export class CriticalFindingConsumer
  extends MessageConsumer<FindingCreatedPayload>
  implements OnApplicationBootstrap
{
  readonly topic = 'security.finding.created';
  readonly groupId = 'alert:finding-critical';

  constructor(
    private readonly fanout: NotificationsFanoutService,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  async process(ctx: MessageContext<FindingCreatedPayload>): Promise<{ enqueued: number }> {
    const p = ctx.payload;
    if ((p.severity ?? '').toUpperCase() !== 'CRITICAL') return { enqueued: 0 };

    const enqueued = await this.fanout.fanout(NotificationEventType.FINDING_CRITICAL, {
      engagementId: p.engagementId,
      findingId: p.findingId,
      assetId: p.assetId,
      title: p.title,
      severity: 'CRITICAL',
    });
    return { enqueued };
  }
}
