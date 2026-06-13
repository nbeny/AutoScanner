import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Severity } from '../../findings/dto/severity.enum';
import { FindingStatus } from './finding-status.enum';

@ObjectType('CorrelatedFinding')
export class CorrelatedFindingObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  assetId!: string;

  @Field()
  structuralHash!: string;

  @Field({ nullable: true })
  category?: string | null;

  @Field()
  title!: string;

  @Field(() => Severity)
  severity!: Severity;

  @Field({ nullable: true })
  cveId?: string | null;

  @Field(() => FindingStatus)
  status!: FindingStatus;

  @Field(() => Int)
  sourceCount!: number;

  @Field(() => [String])
  sources!: string[];

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;
}
