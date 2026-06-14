import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

import { ReportFormat } from './report-format.enum';
import { ReportStatus } from './report-status.enum';
import { ReportTemplateObject } from './report-template.object';

@ObjectType('Report')
export class ReportObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  @Field(() => ID, { nullable: true })
  scanId?: string | null;

  @Field(() => ID)
  templateId!: string;

  @Field(() => ReportTemplateObject)
  template!: ReportTemplateObject;

  @Field(() => ReportFormat)
  format!: ReportFormat;

  @Field(() => ReportStatus)
  status!: ReportStatus;

  @Field(() => GraphQLJSON, { nullable: true })
  filters?: unknown;

  @Field(() => String, { nullable: true })
  storageKey?: string | null;

  @Field(() => Int, { nullable: true })
  sizeBytes?: number | null;

  @Field(() => String, { nullable: true })
  contentType?: string | null;

  @Field(() => String, { nullable: true })
  errorMessage?: string | null;

  @Field(() => ID)
  createdById!: string;

  @Field()
  createdAt!: Date;

  @Field(() => Date, { nullable: true })
  startedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  completedAt?: Date | null;
}
