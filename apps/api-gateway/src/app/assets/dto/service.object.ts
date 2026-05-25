import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Service')
export class ServiceObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  portId!: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  product?: string;

  @Field({ nullable: true })
  version?: string;

  @Field({ nullable: true })
  banner?: string;

  @Field(() => [String])
  cpe!: string[];

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;
}
