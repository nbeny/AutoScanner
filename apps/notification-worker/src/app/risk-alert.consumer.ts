import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConsumerRegistrar, MessageConsumer, type MessageContext } from '@autoscanner/messaging';
import { NotificationsFanoutService, NotificationEventType } from '@autoscanner/notifications';

interface RiskAlertPayload {
  assetId: string;
  engagementId: string;
  riskScore: number;
}

/**
 * SP5a — wires the previously-orphan `security.risk.alert` (emitted by risk-engine when an asset
 * crosses the high-risk threshold, SP2b) into the notification fan-out. Operators only receive it
 * if they have a channel subscribed to the RISK_ALERT event.
 */
@Injectable()
export class RiskAlertConsumer
  extends MessageConsumer<RiskAlertPayload>
  implements OnApplicationBootstrap
{
  readonly topic = 'security.risk.alert';

  constructor(
    private readonly fanout: NotificationsFanoutService,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  async process(ctx: MessageContext<RiskAlertPayload>): Promise<{ enqueued: number }> {
    const { engagementId, assetId, riskScore } = ctx.payload;
    const enqueued = await this.fanout.fanout(NotificationEventType.RISK_ALERT, {
      engagementId,
      assetId,
      riskScore,
      severity: 'CRITICAL',
    });
    return { enqueued };
  }
}
