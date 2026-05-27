import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { TemplateRunStatus } from './template-run-status.enum';

@ObjectType('TemplateRun')
export class TemplateRunObject {
  @Field(() => ID)
  id!: string;

  @Field()
  templateName!: string;

  @Field()
  target!: string;

  @Field(() => TemplateRunStatus)
  status!: TemplateRunStatus;

  @Field(() => Int)
  currentStepIndex!: number;

  @Field({ nullable: true })
  startedAt?: Date;

  @Field({ nullable: true })
  completedAt?: Date;

  @Field({ nullable: true })
  errorMessage?: string;
}

@ObjectType('ScanTemplate')
export class ScanTemplateObject {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  displayName!: string;

  @Field({ nullable: true })
  description?: string;
}
