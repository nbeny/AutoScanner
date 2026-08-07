import { Field, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
export class KaliToolRunEventObject {
  @Field() type!: string;
  @Field(() => String, { nullable: true }) status?: string | null;
  @Field(() => String, { nullable: true }) message?: string | null;
  @Field(() => GraphQLJSON, { nullable: true }) data?: unknown;
}
