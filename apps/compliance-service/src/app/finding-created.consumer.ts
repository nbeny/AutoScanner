import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConsumerRegistrar, MessageConsumer, type MessageContext } from '@autoscanner/messaging';

import { ComplianceService, type FindingCreatedEvent } from './compliance.service';

const FINDING_CREATED_TOPIC = 'security.finding.created';

/** Maps every newly-created finding to control frameworks (SP2d). */
@Injectable()
export class FindingCreatedConsumer
  extends MessageConsumer<FindingCreatedEvent>
  implements OnApplicationBootstrap
{
  readonly topic = FINDING_CREATED_TOPIC;

  constructor(
    private readonly compliance: ComplianceService,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  async process(ctx: MessageContext<FindingCreatedEvent>): Promise<{ mappings: number }> {
    return this.compliance.map(ctx.payload);
  }
}
