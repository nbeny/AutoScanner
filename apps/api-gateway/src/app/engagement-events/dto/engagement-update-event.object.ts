import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

import { EngagementUpdateKind } from '@autoscanner/engagement-events';

registerEnumType(EngagementUpdateKind, { name: 'EngagementUpdateKind' });

@ObjectType('EngagementUpdateEvent')
export class EngagementUpdateEventObject {
  @Field(() => EngagementUpdateKind)
  kind!: EngagementUpdateKind;

  @Field(() => ID)
  engagementId!: string;

  @Field(() => ID, { nullable: true })
  assetId?: string;

  @Field(() => ID, { nullable: true })
  templateRunId?: string;

  @Field(() => String)
  ts!: string;
}
