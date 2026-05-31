import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class KindCount {
  @Field(() => String) kind!: string;
  @Field(() => Int) count!: number;
}

@ObjectType()
export class SeverityCount {
  @Field(() => String) severity!: string;
  @Field(() => Int) count!: number;
}

@ObjectType()
export class TechCount {
  @Field(() => String) name!: string;
  @Field(() => Int) count!: number;
}

@ObjectType('AssetFacets')
export class AssetFacetsObject {
  @Field(() => [KindCount])
  kindCounts!: KindCount[];

  @Field(() => [SeverityCount])
  severityCounts!: SeverityCount[];

  @Field(() => [TechCount])
  topTechs!: TechCount[];

  @Field(() => [String])
  scannerSources!: string[];
}
