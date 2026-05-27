import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Technology')
export class TechnologyObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  assetId!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  version?: string;

  @Field()
  source!: string;

  @Field(() => [String])
  categories!: string[];

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;
}
