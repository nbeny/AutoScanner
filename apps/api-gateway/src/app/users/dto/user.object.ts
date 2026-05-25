import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('User')
export class UserObject {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field({ nullable: true })
  displayName?: string;

  @Field()
  isActive!: boolean;

  @Field()
  totpEnabled!: boolean;

  @Field()
  createdAt!: Date;
}
