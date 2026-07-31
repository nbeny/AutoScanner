import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('ChainCapability')
export class ChainCapabilityObject {
  @Field() name!: string;
  @Field() displayName!: string;
  @Field() description!: string;
  @Field() whenToUse!: string;
  @Field(() => [String]) produces!: string[];
  @Field({ nullable: true }) scopeAcknowledgement?: string;
}
