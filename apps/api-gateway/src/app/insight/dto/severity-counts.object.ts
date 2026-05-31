import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SeverityCountsObject {
  @Field(() => Int) critical!: number;
  @Field(() => Int) high!: number;
  @Field(() => Int) medium!: number;
  @Field(() => Int) low!: number;
  @Field(() => Int) info!: number;
}
