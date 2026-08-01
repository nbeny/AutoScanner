import { UseGuards } from '@nestjs/common';
import { Args, Field, Float, ID, Int, ObjectType, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AttackPathsService } from './attack-paths.service';

@ObjectType('AttackPath')
class AttackPathObject {
  @Field(() => ID)
  correlatedFindingId!: string;

  @Field()
  assetValue!: string;

  @Field()
  title!: string;

  @Field()
  severity!: string;

  @Field({ nullable: true })
  cveId?: string;

  @Field(() => Float)
  score!: number;

  @Field()
  exposed!: boolean;

  @Field()
  rationale!: string;
}

@Resolver()
@UseGuards(JwtAuthGuard)
export class AttackPathsResolver {
  constructor(private readonly svc: AttackPathsService) {}

  /** Part 4 §5 — findings ranked by attacker gain (exposure-weighted), computed over Postgres. */
  @Query(() => [AttackPathObject])
  attackPaths(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<AttackPathObject[]> {
    return this.svc.forEngagement(user.id, engagementId, limit ?? undefined) as Promise<
      AttackPathObject[]
    >;
  }
}
