import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { TemplateRunStatus } from '../../templates/dto/template-run-status.enum';

@ObjectType()
export class RecentTemplateRunObject {
  @Field(() => ID) id!: string;
  @Field() templateName!: string;
  @Field(() => TemplateRunStatus) status!: TemplateRunStatus;
  @Field({ nullable: true }) startedAt?: Date | null;
  @Field({ nullable: true }) completedAt?: Date | null;
  @Field(() => Int, { nullable: true }) durationMs?: number | null;
  @Field(() => Int) newAssetsCount!: number;
  @Field(() => Int) newFindingsCount!: number;
}
