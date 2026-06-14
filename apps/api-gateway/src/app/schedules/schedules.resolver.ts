import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateScheduleInput } from './dto/create-schedule.input';
import { UpdateScheduleInput } from './dto/update-schedule.input';
import { ScheduleObject } from './dto/schedule.object';
import { SchedulesService } from './schedules.service';

@Resolver(() => ScheduleObject)
@UseGuards(JwtAuthGuard)
export class SchedulesResolver {
  constructor(private readonly svc: SchedulesService) {}

  @Mutation(() => ScheduleObject)
  createSchedule(
    @CurrentUser() user: User,
    @Args('input') input: CreateScheduleInput,
  ): Promise<ScheduleObject> {
    return this.svc.create(user.id, input) as Promise<ScheduleObject>;
  }

  @Mutation(() => ScheduleObject)
  updateSchedule(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateScheduleInput,
  ): Promise<ScheduleObject> {
    return this.svc.update(user.id, id, input) as Promise<ScheduleObject>;
  }

  @Mutation(() => Boolean)
  deleteSchedule(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.svc.softDelete(user.id, id);
  }

  @Query(() => [ScheduleObject])
  schedules(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<ScheduleObject[]> {
    return this.svc.listForOwner(user.id, engagementId) as Promise<ScheduleObject[]>;
  }

  @Query(() => ScheduleObject, { nullable: true })
  async schedule(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ScheduleObject | null> {
    return (await this.svc.getForOwner(user.id, id)) as ScheduleObject;
  }
}
