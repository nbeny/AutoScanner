import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { ScanStatus } from './scan-status.enum';

@InputType()
export class ScansFilterInput {
  @Field(() => ScanStatus, { nullable: true }) status?: ScanStatus;
  @Field(() => ID, { nullable: true }) engagementId?: string;
  @Field({ nullable: true }) scannerName?: string;
  @Field(() => Int, { nullable: true }) limit?: number;
  @Field(() => Int, { nullable: true }) offset?: number;
}
