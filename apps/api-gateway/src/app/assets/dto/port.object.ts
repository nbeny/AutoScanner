import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { PortState } from './port-state.enum';
import { Protocol } from './protocol.enum';
import { ServiceObject } from './service.object';

@ObjectType('Port')
export class PortObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  assetId!: string;

  @Field(() => Int)
  number!: number;

  @Field(() => Protocol)
  protocol!: Protocol;

  @Field(() => PortState)
  state!: PortState;

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;

  @Field(() => [ServiceObject], { nullable: 'items' })
  services?: ServiceObject[];
}
