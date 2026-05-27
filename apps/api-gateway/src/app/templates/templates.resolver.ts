import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ScanObject } from '../scans/dto/scan.object';
import { RunTemplateInput } from './dto/run-template.input';
import { ScanTemplateObject, TemplateRunObject } from './dto/template-run.dto';
import { TemplatesService } from './templates.service';

@Resolver(() => TemplateRunObject)
@UseGuards(JwtAuthGuard)
export class TemplatesResolver {
  constructor(private readonly svc: TemplatesService) {}

  @Mutation(() => TemplateRunObject)
  runTemplate(
    @CurrentUser() user: User,
    @Args('input') input: RunTemplateInput,
  ): Promise<TemplateRunObject> {
    return this.svc.runTemplate(user.id, input) as Promise<TemplateRunObject>;
  }

  @Query(() => TemplateRunObject, { nullable: true })
  templateRun(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<TemplateRunObject | null> {
    return this.svc.templateRun(id, user.id) as Promise<TemplateRunObject>;
  }

  @Query(() => [TemplateRunObject])
  templateRuns(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<TemplateRunObject[]> {
    return this.svc.templateRuns(engagementId, user.id) as Promise<TemplateRunObject[]>;
  }

  @Query(() => [ScanTemplateObject])
  scanTemplates(): Promise<ScanTemplateObject[]> {
    return this.svc.scanTemplates() as Promise<ScanTemplateObject[]>;
  }

  @ResolveField('scans', () => [ScanObject])
  scans(@Parent() run: TemplateRunObject): Promise<ScanObject[]> {
    return this.svc.scansForRun(run.id) as Promise<ScanObject[]>;
  }
}
