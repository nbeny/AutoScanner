import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * A single live event streamed over the `aiRunEvents` subscription.
 *
 * The worker publishes discriminated event variants (`status` / `node` /
 * `progress` / `audit-ready`) on `airun:events:<aiRunId>`. GraphQL has no union
 * support wired up here, so this is a flat, optional shape: `type` names the
 * variant and only the fields relevant to that variant are populated.
 */
@ObjectType('AiRunEvent')
export class AiRunEventObject {
  @Field()
  type!: string;

  @Field({ nullable: true })
  status?: string;

  @Field({ nullable: true })
  errorMessage?: string;

  @Field(() => ID, { nullable: true })
  nodeId?: string;

  @Field({ nullable: true })
  scannerName?: string;

  @Field(() => ID, { nullable: true })
  scanId?: string;

  @Field(() => Int, { nullable: true })
  depth?: number;

  @Field(() => Int, { nullable: true })
  round?: number;
}
