import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Severity } from '../../findings/dto/severity.enum';

@ObjectType()
export class TopFindingObject {
  @Field(() => ID) dedupHash!: string;
  @Field() title!: string;
  @Field(() => Severity) severity!: Severity;
  @Field({ nullable: true }) cveId?: string | null;
  @Field(() => Int) affectedAssetCount!: number;
  @Field(() => [String]) scannerSources!: string[];
  @Field() firstSeenAt!: Date;
  @Field() lastSeenAt!: Date;
  @Field(() => ID) exampleAssetId!: string;
}
