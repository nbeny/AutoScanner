import { Field, ID, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

import { ScanTemplateObject } from '../../templates/dto/template-run.dto';

@ObjectType('Schedule')
export class ScheduleObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  @Field(() => ID)
  templateId!: string;

  @Field(() => ScanTemplateObject, { nullable: true })
  template?: ScanTemplateObject;

  @Field()
  name!: string;

  @Field()
  cronExpr!: string;

  @Field()
  timezone!: string;

  @Field(() => [String])
  targets!: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  config?: unknown;

  @Field()
  enabled!: boolean;

  @Field({ nullable: true })
  lastRunAt?: Date | null;

  @Field({ nullable: true })
  nextRunAt?: Date | null;

  @Field(() => ID, { nullable: true })
  lastTemplateRunId?: string | null;

  @Field(() => ID)
  createdById!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
