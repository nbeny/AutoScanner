import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

import { AssetType } from './asset-type.enum';
import { Severity } from '../../findings/dto/severity.enum';

@ObjectType()
export class PortDetail {
  @Field(() => ID) id!: string;
  @Field(() => Int) number!: number;
  @Field(() => String) protocol!: string;
  @Field(() => String) state!: string;
  @Field(() => Date) lastSeenAt!: Date;
}

@ObjectType()
export class ServiceDetail {
  @Field(() => ID) id!: string;
  @Field(() => String, { nullable: true }) name!: string | null;
  @Field(() => String, { nullable: true }) product!: string | null;
  @Field(() => String, { nullable: true }) version!: string | null;
}

@ObjectType()
export class TechnologyDetail {
  @Field(() => ID) id!: string;
  @Field(() => String) name!: string;
  @Field(() => String, { nullable: true }) version!: string | null;
  @Field(() => String) source!: string;
}

@ObjectType()
export class DnsRecordDetail {
  @Field(() => ID) id!: string;
  @Field(() => String) type!: string;
  @Field(() => String) name!: string;
  @Field(() => String) value!: string;
}

@ObjectType()
export class FindingDetail {
  @Field(() => ID) id!: string;
  @Field(() => String) title!: string;
  @Field(() => Severity) severity!: Severity;
  @Field(() => String, { nullable: true }) location!: string | null;
  @Field(() => String, { nullable: true }) cveId!: string | null;
  @Field(() => String, { nullable: true }) templateId!: string | null;
  @Field(() => Date) firstSeenAt!: Date;
  @Field(() => Date) lastSeenAt!: Date;
}

@ObjectType('AssetObservationDetail')
export class AssetObservationDetail {
  @Field(() => ID) id!: string;
  @Field(() => String) kind!: string;
  @Field(() => String) scannerName!: string;
  @Field(() => Date) ts!: Date;
  @Field(() => GraphQLJSON, { nullable: true }) payload?: unknown;
}

@ObjectType('AssetObservationPage')
export class AssetObservationPage {
  @Field(() => [AssetObservationDetail]) items!: AssetObservationDetail[];
  @Field(() => String, { nullable: true }) nextCursor!: string | null;
  @Field(() => Boolean) hasMore!: boolean;
}

@ObjectType('AssetDetail')
export class AssetDetailObject {
  @Field(() => ID) id!: string;
  @Field(() => AssetType) kind!: AssetType;
  @Field(() => String) canonicalValue!: string;
  @Field(() => Float) riskScore!: number;
  @Field(() => Date) firstSeenAt!: Date;
  @Field(() => Date) lastSeenAt!: Date;

  @Field(() => [PortDetail]) ports!: PortDetail[];
  @Field(() => [ServiceDetail]) services!: ServiceDetail[];
  @Field(() => [TechnologyDetail]) technologies!: TechnologyDetail[];
  @Field(() => [DnsRecordDetail]) dnsRecords!: DnsRecordDetail[];
  @Field(() => [FindingDetail]) findings!: FindingDetail[];

  @Field(() => [String]) ipAddresses!: string[];
  @Field(() => [String]) subdomains!: string[];

  @Field(() => [AssetObservationDetail]) observations!: AssetObservationDetail[];

  @Field(() => [String]) scannerSources!: string[];
}
