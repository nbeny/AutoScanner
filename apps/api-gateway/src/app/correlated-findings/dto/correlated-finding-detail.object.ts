import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { Severity } from '../../findings/dto/severity.enum';
import { FindingStatus } from './finding-status.enum';

@ObjectType('EvidenceSource')
export class EvidenceSourceObject {
  @Field()
  scannerName!: string;

  @Field(() => String, { nullable: true })
  location?: string | null;

  /** Raw evidence JSON, serialised to a string for transport. */
  @Field(() => String, { nullable: true })
  evidenceJson?: string | null;
}

@ObjectType('FindingStatusEvent')
export class FindingStatusEventObject {
  @Field(() => ID)
  id!: string;

  @Field(() => FindingStatus)
  fromStatus!: FindingStatus;

  @Field(() => FindingStatus)
  toStatus!: FindingStatus;

  /** displayName ?? email of the actor. */
  @Field()
  actor!: string;

  @Field(() => String, { nullable: true })
  note?: string | null;

  @Field()
  createdAt!: Date;
}

@ObjectType('CorrelatedFindingDetail')
export class CorrelatedFindingDetailObject {
  @Field(() => ID)
  id!: string;

  @Field()
  title!: string;

  @Field(() => Severity)
  severity!: Severity;

  @Field(() => FindingStatus)
  status!: FindingStatus;

  @Field(() => Float)
  riskScore!: number;

  @Field(() => ID)
  assetId!: string;

  @Field()
  assetValue!: string;

  @Field(() => String, { nullable: true })
  cveId?: string | null;

  @Field(() => Float, { nullable: true })
  cvssScore?: number | null;

  @Field(() => String, { nullable: true })
  cvssVector?: string | null;

  @Field(() => [String])
  sources!: string[];

  @Field(() => [EvidenceSourceObject])
  evidence!: EvidenceSourceObject[];

  @Field(() => String, { nullable: true })
  note?: string | null;

  @Field(() => String, { nullable: true })
  remediation?: string | null;

  @Field(() => [FindingStatusEventObject])
  statusHistory!: FindingStatusEventObject[];
}
