import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Identity')
export class IdentityObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  /** USERNAME | EMAIL_ACCOUNT */
  @Field()
  kind!: string;

  @Field()
  seed!: string;

  @Field()
  service!: string;

  @Field(() => String, { nullable: true })
  url!: string | null;

  @Field()
  source!: string;

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;
}
