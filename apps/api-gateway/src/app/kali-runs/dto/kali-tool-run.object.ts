import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
export class KaliToolRunObject {
  @Field(() => ID) id!: string;
  @Field() engagementId!: string;
  @Field() binary!: string;
  @Field(() => [String]) args!: string[];
  @Field(() => String, { nullable: true }) target?: string | null;
  @Field() status!: string;
  @Field(() => String, { nullable: true }) outputFormat?: string | null;
  @Field(() => Int, { nullable: true }) exitCode?: number | null;
  @Field(() => GraphQLJSON, { nullable: true }) parsedJson?: unknown;
  @Field(() => String, { nullable: true }) errorMessage?: string | null;
  @Field(() => String, { nullable: true }) createdAt?: string | null;
}
