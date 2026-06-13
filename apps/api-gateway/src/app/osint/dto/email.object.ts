import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Email')
export class EmailObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  @Field()
  address!: string;

  @Field()
  source!: string;

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;
}
