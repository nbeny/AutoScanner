import { Field, InputType, ObjectType } from '@nestjs/graphql';

@InputType('EngagementAuthHeaderInput')
export class EngagementAuthHeaderInput {
  @Field()
  name!: string;

  @Field()
  value!: string;
}

@InputType('EngagementAuthInput')
export class EngagementAuthInput {
  @Field({ nullable: true })
  cookie?: string;

  @Field(() => [EngagementAuthHeaderInput], { nullable: true })
  headers?: EngagementAuthHeaderInput[];
}

@ObjectType('EngagementAuthStatus')
export class EngagementAuthStatus {
  /** Whether an auth profile is configured — the sealed secret is never exposed. */
  @Field()
  configured!: boolean;

  @Field({ nullable: true })
  updatedAt?: Date;
}
