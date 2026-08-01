import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConsumerRegistrar, MessageConsumer, type MessageContext } from '@autoscanner/messaging';

import { ThreatIntelService, type FindingCreatedEvent } from './threat-intel.service';

const FINDING_CREATED_TOPIC = 'security.finding.created';

/** Enriches every newly-created finding with threat-intel signals (SP2d). */
@Injectable()
export class FindingCreatedConsumer
  extends MessageConsumer<FindingCreatedEvent>
  implements OnApplicationBootstrap
{
  readonly topic = FINDING_CREATED_TOPIC;
  // Distinct group so this service AND compliance-service each receive every finding.created.
  readonly groupId = 'threat-intel:finding-created';

  constructor(
    private readonly threatIntel: ThreatIntelService,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  async process(ctx: MessageContext<FindingCreatedEvent>): Promise<{ signals: number }> {
    return this.threatIntel.enrich(ctx.payload);
  }
}
