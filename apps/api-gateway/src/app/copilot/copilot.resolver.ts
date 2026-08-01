import { UseGuards } from '@nestjs/common';
import { Args, Field, ID, ObjectType, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CopilotService } from './copilot.service';

@ObjectType('CopilotAnswer')
class CopilotAnswerObject {
  @Field()
  answer!: string;

  @Field(() => [String])
  references!: string[];

  @Field()
  degraded!: boolean;
}

@Resolver()
@UseGuards(JwtAuthGuard)
export class CopilotResolver {
  constructor(private readonly svc: CopilotService) {}

  /** Part 4 §17 assistant/query — ask the Security Copilot about an engagement. */
  @Query(() => CopilotAnswerObject)
  assistantQuery(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('question') question: string,
  ): Promise<CopilotAnswerObject> {
    return this.svc.ask(user.id, engagementId, question);
  }
}
