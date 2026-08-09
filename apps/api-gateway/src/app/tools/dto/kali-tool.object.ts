// apps/api-gateway/src/app/tools/dto/kali-tool.object.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class KaliToolOptionObject {
  @Field() flag!: string;
  @Field(() => String, { nullable: true }) argHint?: string | null;
  @Field() description!: string;
}

@ObjectType()
export class KaliToolSummaryObject {
  @Field() binary!: string;
  @Field() package!: string;
  @Field() displayName!: string;
  @Field() description!: string;
  @Field(() => [String]) categories!: string[];
  @Field() hasHelp!: boolean;
  @Field(() => Int) optionCount!: number;
}

@ObjectType()
export class KaliToolDetailObject extends KaliToolSummaryObject {
  @Field(() => String, { nullable: true }) homepage?: string | null;
  @Field(() => String, { nullable: true }) helpTextRaw?: string | null;
  @Field(() => [KaliToolOptionObject]) options!: KaliToolOptionObject[];
  @Field() parseConfidence!: string;
  @Field() manAvailable!: boolean;
  @Field() optionsSource!: string;
  @Field(() => String, { nullable: true }) manTextRaw?: string | null;
  @Field() kaliRelease!: string;
  @Field() capturedAt!: string;
}
