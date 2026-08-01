import { Field, Float, ObjectType } from '@nestjs/graphql';

/**
 * One finding enriched by the AI fleet (SP4c/SP4d): the Finding-Analyst impact/priority/action,
 * the False-Positive confidence/status, and the Remediation steps. Sourced from
 * `AiRun.analysisJson.findings`.
 */
@ObjectType('AiFindingAnalysis')
export class AiFindingAnalysisObject {
  @Field()
  title!: string;

  @Field()
  severity!: string;

  @Field({ nullable: true })
  cveId?: string;

  @Field()
  impact!: string;

  @Field()
  priority!: string;

  @Field()
  action!: string;

  @Field(() => Float)
  confidence!: number;

  @Field()
  status!: string;

  @Field(() => [String])
  remediation!: string[];

  @Field()
  degraded!: boolean;
}
