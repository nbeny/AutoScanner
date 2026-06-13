import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Endpoint')
export class EndpointObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  @Field()
  url!: string;

  @Field()
  canonicalUrl!: string;

  @Field()
  method!: string;

  @Field(() => Int, { nullable: true })
  statusCode?: number | null;

  @Field(() => Int, { nullable: true })
  contentLength?: number | null;

  @Field()
  source!: string;

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;
}
