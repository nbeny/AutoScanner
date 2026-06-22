import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Severity } from '../../findings/dto/severity.enum';
import { FindingStatus } from './finding-status.enum';

@InputType()
export class CorrelatedFindingsFilterInput {
  @Field(() => ID, { nullable: true }) engagementId?: string;
  @Field(() => Severity, { nullable: true }) severity?: Severity;
  @Field(() => FindingStatus, { nullable: true }) status?: FindingStatus;
  @Field({ nullable: true }) search?: string;
  @Field(() => Int, { nullable: true }) limit?: number;
  @Field(() => Int, { nullable: true }) offset?: number;
}
