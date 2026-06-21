import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ScanStatus } from './scan-status.enum';

@ObjectType('ScanJob')
export class ScanJobObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  scanId!: string;

  @Field()
  scannerName!: string;

  @Field()
  target!: string;

  @Field(() => ScanStatus)
  status!: ScanStatus;

  @Field({ nullable: true })
  queuedAt?: Date;

  @Field({ nullable: true })
  startedAt?: Date;

  @Field({ nullable: true })
  completedAt?: Date;

  @Field(() => Int, { nullable: true })
  exitCode?: number;

  @Field(() => Int, { nullable: true })
  durationMs?: number;

  @Field({ nullable: true })
  rawOutputKey?: string;

  @Field({ nullable: true })
  errorMessage?: string;

  @Field()
  createdAt!: Date;

  @Field(() => Int)
  findingCount!: number;
}
