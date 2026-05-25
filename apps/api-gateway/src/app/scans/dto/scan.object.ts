import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ScanStatus } from './scan-status.enum';
import { ScanJobObject } from './scan-job.object';

@ObjectType('Scan')
export class ScanObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  @Field(() => ID)
  createdById!: string;

  @Field({ nullable: true })
  name?: string;

  @Field(() => ScanStatus)
  status!: ScanStatus;

  @Field()
  createdAt!: Date;

  @Field({ nullable: true })
  completedAt?: Date;

  @Field(() => [ScanJobObject], { nullable: 'items' })
  jobs?: ScanJobObject[];
}
