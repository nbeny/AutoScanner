import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerateReportInput } from './dto/generate-report.input';
import { ReportTemplateObject } from './dto/report-template.object';
import { ReportObject } from './dto/report.object';
import { ReportsService } from './reports.service';

import './dto/report-format.enum';
import './dto/report-status.enum';

@Resolver(() => ReportObject)
@UseGuards(JwtAuthGuard)
export class ReportsResolver {
  constructor(private readonly svc: ReportsService) {}

  @Mutation(() => ReportObject)
  generateReport(
    @CurrentUser() user: User,
    @Args('input') input: GenerateReportInput,
  ): Promise<ReportObject> {
    return this.svc.generateReport(user.id, input) as Promise<ReportObject>;
  }

  @Query(() => [ReportObject])
  reports(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<ReportObject[]> {
    return this.svc.listForOwner(user.id, engagementId) as Promise<ReportObject[]>;
  }

  @Query(() => ReportObject, { nullable: true })
  async report(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ReportObject | null> {
    return (await this.svc.getForOwner(user.id, id)) as ReportObject;
  }

  @Query(() => [ReportTemplateObject])
  reportTemplates(): Promise<ReportTemplateObject[]> {
    return this.svc.listTemplates() as Promise<ReportTemplateObject[]>;
  }

  @ResolveField('downloadUrl', () => String, { nullable: true })
  downloadUrl(@Parent() report: ReportObject): Promise<string | null> {
    return this.svc.presignDownloadUrl(report as never);
  }
}
