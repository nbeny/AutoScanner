import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('BreachExposure')
export class BreachExposureObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  @Field(() => ID, { nullable: true })
  emailId!: string | null;

  @Field()
  seed!: string;

  @Field()
  breachName!: string;

  @Field(() => Date, { nullable: true })
  breachDate!: Date | null;

  @Field(() => [String])
  dataClasses!: string[];

  @Field()
  passwordExposed!: boolean;

  @Field()
  severity!: string;

  @Field()
  source!: string;

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;
}
