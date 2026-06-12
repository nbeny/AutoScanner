import { Field, ID, ObjectType } from '@nestjs/graphql';

import { ReportFormat } from './report-format.enum';

@ObjectType('ReportTemplate')
export class ReportTemplateObject {
  @Field(() => ID)
  id!: string;

  @Field()
  slug!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string | null;

  @Field(() => ReportFormat)
  format!: ReportFormat;

  @Field()
  isDefault!: boolean;
}
