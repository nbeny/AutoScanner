# Phase 5.2 — Scheduler GraphQL + UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Date:** 2026-06-14
> **Spec:** `docs/superpowers/specs/2026-06-12-phase-5-scheduler-notifications-agents-design.md` §2 (5.2), §5.2.
> **Branch:** `phase-5-2-scheduler-graphql-ui` (already checked out, currently at `main`).
> **Previous:** Phase 5.1 delivered the `Schedule` Prisma model + migration `20260612200000_phase5_schedule` + `apps/scheduler` hydrator. This phase adds the GraphQL CRUD surface and the UI.

**Goal:** Operators can create, list, enable/disable, and delete `Schedule` rows for an engagement through GraphQL and a "Schedules" tab in the engagement page, seeing the computed `nextRunAt`.

**Architecture:** A new NestJS `SchedulesModule` in `apps/api-gateway` (resolver + service + DTOs), mirroring the existing `reports`/`engagements` modules. The service writes `Schedule` rows directly — it does **not** enqueue anything; the Phase 5.1 `apps/scheduler` hydrator polls the DB and enqueues `template-runs` at cron time. `nextRunAt` is computed at create/update via `cron-parser` so the UI shows it immediately. The frontend adds a `SchedulesTab` wired into the existing `EngagementPage` tab strip.

**Tech Stack:** NestJS 10 + `@nestjs/graphql` (Apollo, code-first), Prisma, `cron-parser` v5 (`CronExpressionParser`), React 18 + `@apollo/client`, Vitest (frontend), Jest (backend + e2e), Tailwind.

---

## Pre-requisites / context the implementer must know

- **No migration is needed.** `model Schedule` already exists in `prisma/schema.prisma` (line ~743) with fields: `id, engagementId, templateId, name, cronExpr, timezone (default "UTC"), targets String[], config Json?, enabled (default true), lastRunAt?, nextRunAt?, lastTemplateRunId?, createdById, createdAt, updatedAt, deletedAt?` and relations `engagement`, `template (ScanTemplate)`, `createdBy (User)`. `prisma generate` has already run; `PrismaService.schedule` is available.
- **Ownership model:** Engagements belong to a `User` via `ownerId`. Every query/mutation scopes by the authenticated user. The canonical filter (see `reports.service.ts`) is `engagement: { ownerId: userId, deletedAt: null }`.
- **Auth:** Resolvers use `@UseGuards(JwtAuthGuard)` (from `../auth/guards/jwt-auth.guard`) and read the user via `@CurrentUser()` (from `../auth/decorators/current-user.decorator`). The module must `imports: [AuthModule]`.
- **Domain errors** (`@autoscanner/common`): `NotFoundError(entity, key)`, `ValidationError(message, issues?)`. These are mapped to GraphQL error codes by `graphql-error.formatter.ts`. Use `NotFoundError` for missing engagement/template/schedule and `ValidationError` for bad cron / empty targets.
- **Cron validation/`nextRunAt`:** `import { CronExpressionParser } from 'cron-parser';` then `CronExpressionParser.parse(cronExpr, { tz: timezone }).next().toDate()`. This throws on an invalid expression or timezone — wrap in try/catch and rethrow as `ValidationError`. This is the same import the Phase 5.1 hydrator uses (`apps/scheduler/src/app/schedule-hydrator.service.ts:4`).
- **ScanTemplate** is a DB model with `{ id, name, displayName, description }`. The `scanTemplates` query already exists (`templates.resolver.ts`) and the frontend already has `SCAN_TEMPLATES_QUERY`. The schedule form reuses it; `Schedule.templateId` stores `ScanTemplate.id`.
- **GraphQL schema is code-first and auto-generated** to `apps/api-gateway/src/schema.gql` (`autoSchemaFile`, `sortSchema: true`). Do **not** hand-edit it; it regenerates when the api-gateway boots/builds. After adding the module, run `pnpm nx build api-gateway` (or the e2e) to regenerate it; commit the regenerated `schema.gql` if it changes.
- **Frontend conventions:** Apollo `useQuery`/`useMutation`, GraphQL docs centralized in `apps/frontend/src/lib/graphql/queries.ts`, per-engagement features rendered as tabs in `engagement-page.tsx`, forms use `aria-label` on `<form>` and `aria-label` on inputs, errors rendered with `role="alert"`. Tests use `MockedProvider` + `MemoryRouter` + Testing Library.

---

## File Structure

**Backend — create (`apps/api-gateway/src/app/schedules/`):**
- `dto/schedule.object.ts` — `ScheduleObject` GraphQL `@ObjectType`.
- `dto/create-schedule.input.ts` — `CreateScheduleInput`.
- `dto/update-schedule.input.ts` — `UpdateScheduleInput`.
- `schedules.service.ts` — `SchedulesService` (Prisma CRUD + cron validation).
- `schedules.resolver.ts` — `SchedulesResolver` (queries + mutations, `JwtAuthGuard`).
- `schedules.module.ts` — `SchedulesModule`.
- `__tests__/schedules.service.spec.ts` — unit tests.

**Backend — modify:**
- `apps/api-gateway/src/app/app.module.ts` — import + register `SchedulesModule`.

**Frontend — create (`apps/frontend/src/features/schedules/`):**
- `schedules-tab.tsx` — `SchedulesTab` (list + create form + enable/disable + delete).
- `__tests__/schedules-tab.spec.tsx` — Vitest component test.

**Frontend — modify:**
- `apps/frontend/src/lib/graphql/queries.ts` — add `SCHEDULES_QUERY`, `CREATE_SCHEDULE_MUTATION`, `UPDATE_SCHEDULE_MUTATION`, `DELETE_SCHEDULE_MUTATION`.
- `apps/frontend/src/features/engagements/engagement-page.tsx` — add `'schedules'` tab.

**E2E — create:**
- `apps/api-gateway-e2e/src/scenarios/scheduler-graphql-e2e.spec.ts` — gated `SCHEDULER_E2E=1`.

---

## T1 — Backend DTOs

**Files:**
- Create: `apps/api-gateway/src/app/schedules/dto/schedule.object.ts`
- Create: `apps/api-gateway/src/app/schedules/dto/create-schedule.input.ts`
- Create: `apps/api-gateway/src/app/schedules/dto/update-schedule.input.ts`

- [ ] **T1.1 — Create `dto/schedule.object.ts`**

```ts
import { Field, ID, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

import { ScanTemplateObject } from '../../templates/dto/template-run.dto';

@ObjectType('Schedule')
export class ScheduleObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  @Field(() => ID)
  templateId!: string;

  @Field(() => ScanTemplateObject, { nullable: true })
  template?: ScanTemplateObject;

  @Field()
  name!: string;

  @Field()
  cronExpr!: string;

  @Field()
  timezone!: string;

  @Field(() => [String])
  targets!: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  config?: unknown;

  @Field()
  enabled!: boolean;

  @Field({ nullable: true })
  lastRunAt?: Date | null;

  @Field({ nullable: true })
  nextRunAt?: Date | null;

  @Field(() => ID, { nullable: true })
  lastTemplateRunId?: string | null;

  @Field(() => ID)
  createdById!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
```

- [ ] **T1.2 — Create `dto/create-schedule.input.ts`**

```ts
import { Field, ID, InputType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateScheduleInput {
  @Field(() => ID)
  @IsString()
  engagementId!: string;

  @Field(() => ID)
  @IsString()
  templateId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cronExpr!: string;

  @Field({ nullable: true, defaultValue: 'UTC' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @Field(() => [String])
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  targets!: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  config?: unknown;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
```

- [ ] **T1.3 — Create `dto/update-schedule.input.ts`**

```ts
import { Field, InputType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class UpdateScheduleInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cronExpr?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  targets?: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  config?: unknown;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
```

- [ ] **T1.4 — Commit**

```bash
git add apps/api-gateway/src/app/schedules/dto
git commit -m "feat(phase-5.2): schedule GraphQL DTOs (object + create/update inputs)"
```

---

## T2 — `SchedulesService` (TDD)

**Files:**
- Create: `apps/api-gateway/src/app/schedules/schedules.service.ts`
- Test: `apps/api-gateway/src/app/schedules/__tests__/schedules.service.spec.ts`

The service: validates engagement ownership + template existence + cron validity, computes `nextRunAt`, and performs CRUD. It does **not** enqueue (the scheduler hydrator owns enqueue). `delete` is a soft delete (`deletedAt = now`).

- [ ] **T2.1 — Write the failing test `__tests__/schedules.service.spec.ts`**

```ts
import { NotFoundError, ValidationError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import { SchedulesService } from '../schedules.service';

const USER_ID = 'user_1';
const ENGAGEMENT_ID = 'eng_1';
const TEMPLATE_ID = 'tpl_1';

function makeSchedule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sch_1',
    engagementId: ENGAGEMENT_ID,
    templateId: TEMPLATE_ID,
    name: 'nightly recon',
    cronExpr: '0 2 * * *',
    timezone: 'UTC',
    targets: ['example.com'],
    config: null,
    enabled: true,
    lastRunAt: null,
    nextRunAt: new Date('2026-06-15T02:00:00Z'),
    lastTemplateRunId: null,
    createdById: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    template: { id: TEMPLATE_ID, name: 'recon-passive', displayName: 'Passive Recon' },
    ...overrides,
  };
}

describe('SchedulesService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: SchedulesService;

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      scanTemplate: { findUnique: jest.fn() },
      schedule: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;
    svc = new SchedulesService(prisma);
  });

  describe('create', () => {
    const validInput = {
      engagementId: ENGAGEMENT_ID,
      templateId: TEMPLATE_ID,
      name: 'nightly recon',
      cronExpr: '0 2 * * *',
      timezone: 'UTC',
      targets: ['example.com'],
    };

    it('creates a schedule with a computed nextRunAt', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: ENGAGEMENT_ID });
      (prisma.scanTemplate.findUnique as jest.Mock).mockResolvedValue({ id: TEMPLATE_ID });
      (prisma.schedule.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve(makeSchedule(data)),
      );

      await svc.create(USER_ID, validInput);

      const createArg = (prisma.schedule.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data).toEqual(
        expect.objectContaining({
          engagementId: ENGAGEMENT_ID,
          templateId: TEMPLATE_ID,
          name: 'nightly recon',
          cronExpr: '0 2 * * *',
          timezone: 'UTC',
          targets: ['example.com'],
          enabled: true,
          createdById: USER_ID,
        }),
      );
      expect(createArg.data.nextRunAt).toBeInstanceOf(Date);
      expect(createArg.include).toEqual({ template: true });
    });

    it('throws NotFoundError when the engagement does not belong to the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(svc.create(USER_ID, validInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.schedule.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the template does not exist', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: ENGAGEMENT_ID });
      (prisma.scanTemplate.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(svc.create(USER_ID, validInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.schedule.create).not.toHaveBeenCalled();
    });

    it('throws ValidationError on an invalid cron expression', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: ENGAGEMENT_ID });
      (prisma.scanTemplate.findUnique as jest.Mock).mockResolvedValue({ id: TEMPLATE_ID });
      await expect(
        svc.create(USER_ID, { ...validInput, cronExpr: 'NOT A CRON' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(prisma.schedule.create).not.toHaveBeenCalled();
    });

    it('defaults timezone to UTC and enabled to true when omitted', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: ENGAGEMENT_ID });
      (prisma.scanTemplate.findUnique as jest.Mock).mockResolvedValue({ id: TEMPLATE_ID });
      (prisma.schedule.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve(makeSchedule(data)),
      );

      await svc.create(USER_ID, {
        engagementId: ENGAGEMENT_ID,
        templateId: TEMPLATE_ID,
        name: 'n',
        cronExpr: '0 2 * * *',
        targets: ['example.com'],
      });

      const createArg = (prisma.schedule.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data.timezone).toBe('UTC');
      expect(createArg.data.enabled).toBe(true);
    });
  });

  describe('listForOwner', () => {
    it('filters by engagement.ownerId, excludes soft-deleted, orders by createdAt desc', async () => {
      (prisma.schedule.findMany as jest.Mock).mockResolvedValue([]);
      await svc.listForOwner(USER_ID, ENGAGEMENT_ID);
      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            engagementId: ENGAGEMENT_ID,
            deletedAt: null,
            engagement: { ownerId: USER_ID, deletedAt: null },
          },
          include: { template: true },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('update', () => {
    it('recomputes nextRunAt when cronExpr changes', async () => {
      (prisma.schedule.findFirst as jest.Mock).mockResolvedValue(makeSchedule());
      (prisma.schedule.update as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve(makeSchedule(data)),
      );

      await svc.update(USER_ID, 'sch_1', { cronExpr: '*/5 * * * *' });

      const updateArg = (prisma.schedule.update as jest.Mock).mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'sch_1' });
      expect(updateArg.data.cronExpr).toBe('*/5 * * * *');
      expect(updateArg.data.nextRunAt).toBeInstanceOf(Date);
    });

    it('toggles enabled without recomputing nextRunAt when cron is unchanged', async () => {
      (prisma.schedule.findFirst as jest.Mock).mockResolvedValue(makeSchedule());
      (prisma.schedule.update as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve(makeSchedule(data)),
      );

      await svc.update(USER_ID, 'sch_1', { enabled: false });

      const updateArg = (prisma.schedule.update as jest.Mock).mock.calls[0][0];
      expect(updateArg.data.enabled).toBe(false);
      expect(updateArg.data.nextRunAt).toBeUndefined();
    });

    it('throws NotFoundError when the schedule is not owned by the user', async () => {
      (prisma.schedule.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(svc.update(USER_ID, 'missing', { enabled: false })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(prisma.schedule.update).not.toHaveBeenCalled();
    });

    it('throws ValidationError when the new cron is invalid', async () => {
      (prisma.schedule.findFirst as jest.Mock).mockResolvedValue(makeSchedule());
      await expect(svc.update(USER_ID, 'sch_1', { cronExpr: 'nope' })).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(prisma.schedule.update).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt and returns true', async () => {
      (prisma.schedule.findFirst as jest.Mock).mockResolvedValue(makeSchedule());
      (prisma.schedule.update as jest.Mock).mockResolvedValue(makeSchedule({ deletedAt: new Date() }));
      const result = await svc.softDelete(USER_ID, 'sch_1');
      expect(result).toBe(true);
      const updateArg = (prisma.schedule.update as jest.Mock).mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'sch_1' });
      expect(updateArg.data.deletedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundError when the schedule is not owned by the user', async () => {
      (prisma.schedule.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(svc.softDelete(USER_ID, 'missing')).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.schedule.update).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **T2.2 — Run the test, verify it fails**

Run: `pnpm nx test api-gateway --testPathPattern=schedules.service`
Expected: FAIL — `Cannot find module '../schedules.service'`.

- [ ] **T2.3 — Implement `schedules.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';
import { Prisma } from '@prisma/client';
import type { Schedule, ScanTemplate } from '@prisma/client';

import { NotFoundError, ValidationError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

import { CreateScheduleInput } from './dto/create-schedule.input';
import { UpdateScheduleInput } from './dto/update-schedule.input';

export type ScheduleWithTemplate = Schedule & { template: ScanTemplate };

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateScheduleInput): Promise<ScheduleWithTemplate> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: input.engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', input.engagementId);

    const template = await this.prisma.scanTemplate.findUnique({
      where: { id: input.templateId },
      select: { id: true },
    });
    if (!template) throw new NotFoundError('ScanTemplate', input.templateId);

    const timezone = input.timezone ?? 'UTC';
    const nextRunAt = this.computeNextRun(input.cronExpr, timezone);

    const created = (await this.prisma.schedule.create({
      data: {
        engagementId: input.engagementId,
        templateId: input.templateId,
        name: input.name,
        cronExpr: input.cronExpr,
        timezone,
        targets: input.targets,
        config: input.config ? (input.config as Prisma.InputJsonValue) : Prisma.JsonNull,
        enabled: input.enabled ?? true,
        nextRunAt,
        createdById: userId,
      },
      include: { template: true },
    })) as ScheduleWithTemplate;

    this.logger.log(`Created schedule=${created.id} engagement=${input.engagementId}`);
    return created;
  }

  listForOwner(userId: string, engagementId: string): Promise<ScheduleWithTemplate[]> {
    return this.prisma.schedule.findMany({
      where: {
        engagementId,
        deletedAt: null,
        engagement: { ownerId: userId, deletedAt: null },
      },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    }) as Promise<ScheduleWithTemplate[]>;
  }

  async getForOwner(userId: string, id: string): Promise<ScheduleWithTemplate> {
    const found = await this.requireOwned(userId, id);
    return found;
  }

  async update(
    userId: string,
    id: string,
    input: UpdateScheduleInput,
  ): Promise<ScheduleWithTemplate> {
    const existing = await this.requireOwned(userId, id);

    const data: Prisma.ScheduleUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.targets !== undefined) data.targets = input.targets;
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.config !== undefined) {
      data.config = input.config
        ? (input.config as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }

    const nextCron = input.cronExpr ?? existing.cronExpr;
    const nextTz = input.timezone ?? existing.timezone;
    if (input.cronExpr !== undefined) data.cronExpr = input.cronExpr;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.cronExpr !== undefined || input.timezone !== undefined) {
      data.nextRunAt = this.computeNextRun(nextCron, nextTz);
    }

    return this.prisma.schedule.update({
      where: { id },
      data,
      include: { template: true },
    }) as Promise<ScheduleWithTemplate>;
  }

  async softDelete(userId: string, id: string): Promise<boolean> {
    await this.requireOwned(userId, id);
    await this.prisma.schedule.update({
      where: { id },
      data: { deletedAt: new Date(), enabled: false },
    });
    this.logger.log(`Soft-deleted schedule=${id}`);
    return true;
  }

  private async requireOwned(userId: string, id: string): Promise<ScheduleWithTemplate> {
    const found = await this.prisma.schedule.findFirst({
      where: {
        id,
        deletedAt: null,
        engagement: { ownerId: userId, deletedAt: null },
      },
      include: { template: true },
    });
    if (!found) throw new NotFoundError('Schedule', id);
    return found as ScheduleWithTemplate;
  }

  private computeNextRun(cronExpr: string, timezone: string): Date {
    try {
      return CronExpressionParser.parse(cronExpr, { tz: timezone }).next().toDate();
    } catch (err) {
      throw new ValidationError(
        `Invalid cron expression "${cronExpr}" (tz=${timezone})`,
        err,
      );
    }
  }
}
```

- [ ] **T2.4 — Run the test, verify it passes**

Run: `pnpm nx test api-gateway --testPathPattern=schedules.service`
Expected: PASS (all `SchedulesService` cases green).

- [ ] **T2.5 — Commit**

```bash
git add apps/api-gateway/src/app/schedules/schedules.service.ts apps/api-gateway/src/app/schedules/__tests__/schedules.service.spec.ts
git commit -m "feat(phase-5.2): SchedulesService CRUD + cron-validated nextRunAt"
```

---

## T3 — `SchedulesResolver` + `SchedulesModule` + app wiring

**Files:**
- Create: `apps/api-gateway/src/app/schedules/schedules.resolver.ts`
- Create: `apps/api-gateway/src/app/schedules/schedules.module.ts`
- Modify: `apps/api-gateway/src/app/app.module.ts`

- [ ] **T3.1 — Create `schedules.resolver.ts`**

```ts
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
```

- [ ] **T3.2 — Create `schedules.module.ts`**

```ts
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SchedulesResolver } from './schedules.resolver';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [AuthModule],
  providers: [SchedulesService, SchedulesResolver],
})
export class SchedulesModule {}
```

- [ ] **T3.3 — Register `SchedulesModule` in `app.module.ts`**

Add the import near the other module imports (alphabetical neighbours: after `ScansModule`):

```ts
import { SchedulesModule } from './schedules/schedules.module';
```

Add `SchedulesModule` to the `imports:` array of `@Module`, placed after `ScansModule,` and before `TemplatesModule,`:

```ts
    ScansModule,
    SchedulesModule,
    TemplatesModule,
```

- [ ] **T3.4 — Build api-gateway to regenerate the GraphQL schema**

Run: `pnpm nx build api-gateway`
Expected: build succeeds. `apps/api-gateway/src/schema.gql` now contains `type Schedule`, `input CreateScheduleInput`, `input UpdateScheduleInput`, and the `createSchedule`/`updateSchedule`/`deleteSchedule`/`schedules`/`schedule` fields.

If the build environment can't run the Nest build, instead run the unit test target which boots metadata: `pnpm nx test api-gateway --testPathPattern=schedules` and regenerate `schema.gql` by running the api-gateway once (`pnpm nx serve api-gateway` then Ctrl-C) — the `autoSchemaFile` writes on boot.

- [ ] **T3.5 — Lint + type-check**

Run: `pnpm nx run-many -t lint,type-check -p api-gateway`
Expected: PASS.

- [ ] **T3.6 — Commit**

```bash
git add apps/api-gateway/src/app/schedules/schedules.resolver.ts apps/api-gateway/src/app/schedules/schedules.module.ts apps/api-gateway/src/app/app.module.ts apps/api-gateway/src/schema.gql
git commit -m "feat(phase-5.2): SchedulesResolver + module + schema.gql regen"
```

---

## T4 — Frontend GraphQL documents

**Files:**
- Modify: `apps/frontend/src/lib/graphql/queries.ts`

- [ ] **T4.1 — Append the schedule documents to `queries.ts`**

Add at the end of the file (after `SET_FINDING_STATUS`):

```ts
export const SCHEDULES_QUERY = gql`
  query Schedules($engagementId: ID!) {
    schedules(engagementId: $engagementId) {
      id
      name
      cronExpr
      timezone
      targets
      enabled
      nextRunAt
      lastRunAt
      templateId
      template {
        id
        name
        displayName
      }
    }
  }
`;

export const CREATE_SCHEDULE_MUTATION = gql`
  mutation CreateSchedule($input: CreateScheduleInput!) {
    createSchedule(input: $input) {
      id
      name
      cronExpr
      timezone
      targets
      enabled
      nextRunAt
      templateId
      template {
        id
        displayName
      }
    }
  }
`;

export const UPDATE_SCHEDULE_MUTATION = gql`
  mutation UpdateSchedule($id: ID!, $input: UpdateScheduleInput!) {
    updateSchedule(id: $id, input: $input) {
      id
      enabled
      cronExpr
      timezone
      nextRunAt
    }
  }
`;

export const DELETE_SCHEDULE_MUTATION = gql`
  mutation DeleteSchedule($id: ID!) {
    deleteSchedule(id: $id)
  }
`;
```

- [ ] **T4.2 — Commit**

```bash
git add apps/frontend/src/lib/graphql/queries.ts
git commit -m "feat(phase-5.2): frontend schedule GraphQL documents"
```

---

## T5 — `SchedulesTab` component (TDD)

**Files:**
- Create: `apps/frontend/src/features/schedules/schedules-tab.tsx`
- Test: `apps/frontend/src/features/schedules/__tests__/schedules-tab.spec.tsx`

- [ ] **T5.1 — Write the failing test `__tests__/schedules-tab.spec.tsx`**

```tsx
import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  CREATE_SCHEDULE_MUTATION,
  DELETE_SCHEDULE_MUTATION,
  SCAN_TEMPLATES_QUERY,
  SCHEDULES_QUERY,
  UPDATE_SCHEDULE_MUTATION,
} from '../../../lib/graphql/queries';
import { SchedulesTab } from '../schedules-tab';

const ENGAGEMENT_ID = 'eng_1';

const templatesMock = {
  request: { query: SCAN_TEMPLATES_QUERY },
  result: {
    data: {
      scanTemplates: [
        { id: 'tpl_1', name: 'recon-passive', displayName: 'Passive Recon', description: null },
      ],
    },
  },
};

function scheduleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sch_1',
    name: 'nightly recon',
    cronExpr: '0 2 * * *',
    timezone: 'UTC',
    targets: ['example.com'],
    enabled: true,
    nextRunAt: '2026-06-15T02:00:00.000Z',
    lastRunAt: null,
    templateId: 'tpl_1',
    template: { id: 'tpl_1', name: 'recon-passive', displayName: 'Passive Recon' },
    ...overrides,
  };
}

const schedulesMock = {
  request: { query: SCHEDULES_QUERY, variables: { engagementId: ENGAGEMENT_ID } },
  result: { data: { schedules: [scheduleRow()] } },
};

function renderTab(mocks: Parameters<typeof MockedProvider>[0]['mocks']) {
  return render(
    <MemoryRouter>
      <MockedProvider mocks={mocks}>
        <SchedulesTab engagementId={ENGAGEMENT_ID} />
      </MockedProvider>
    </MemoryRouter>,
  );
}

describe('<SchedulesTab />', () => {
  it('renders existing schedules', async () => {
    renderTab([templatesMock, schedulesMock]);
    expect(await screen.findByText('nightly recon')).toBeInTheDocument();
    expect(screen.getByText('0 2 * * *')).toBeInTheDocument();
    expect(screen.getByText('Passive Recon')).toBeInTheDocument();
  });

  it('creates a schedule and refetches the list', async () => {
    const createMock = {
      request: {
        query: CREATE_SCHEDULE_MUTATION,
        variables: {
          input: {
            engagementId: ENGAGEMENT_ID,
            templateId: 'tpl_1',
            name: 'daily',
            cronExpr: '0 6 * * *',
            timezone: 'UTC',
            targets: ['example.com'],
          },
        },
      },
      result: {
        data: {
          createSchedule: {
            id: 'sch_2',
            name: 'daily',
            cronExpr: '0 6 * * *',
            timezone: 'UTC',
            targets: ['example.com'],
            enabled: true,
            nextRunAt: '2026-06-15T06:00:00.000Z',
            templateId: 'tpl_1',
            template: { id: 'tpl_1', displayName: 'Passive Recon' },
          },
        },
      },
    };
    const refetchedMock = {
      request: { query: SCHEDULES_QUERY, variables: { engagementId: ENGAGEMENT_ID } },
      result: {
        data: { schedules: [scheduleRow({ id: 'sch_2', name: 'daily', cronExpr: '0 6 * * *' })] },
      },
    };

    renderTab([templatesMock, schedulesMock, createMock, refetchedMock]);

    await screen.findByText('nightly recon');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'daily' } });
    fireEvent.change(screen.getByLabelText('Cron'), { target: { value: '0 6 * * *' } });
    fireEvent.change(screen.getByLabelText('Targets'), { target: { value: 'example.com' } });
    fireEvent.submit(screen.getByRole('form', { name: 'create-schedule' }));

    await waitFor(() => expect(screen.getByText('daily')).toBeInTheDocument());
  });

  it('disables a schedule via the toggle button', async () => {
    const updateMock = {
      request: {
        query: UPDATE_SCHEDULE_MUTATION,
        variables: { id: 'sch_1', input: { enabled: false } },
      },
      result: {
        data: {
          updateSchedule: {
            id: 'sch_1',
            enabled: false,
            cronExpr: '0 2 * * *',
            timezone: 'UTC',
            nextRunAt: '2026-06-15T02:00:00.000Z',
          },
        },
      },
    };
    const refetchedMock = {
      request: { query: SCHEDULES_QUERY, variables: { engagementId: ENGAGEMENT_ID } },
      result: { data: { schedules: [scheduleRow({ enabled: false })] } },
    };

    renderTab([templatesMock, schedulesMock, updateMock, refetchedMock]);

    await screen.findByText('nightly recon');
    fireEvent.click(screen.getByRole('button', { name: 'Disable schedule sch_1' }));

    await waitFor(() => expect(screen.getByText('Disabled')).toBeInTheDocument());
  });

  it('exposes a delete control wired to the delete mutation', async () => {
    const deleteMock = {
      request: { query: DELETE_SCHEDULE_MUTATION, variables: { id: 'sch_1' } },
      result: { data: { deleteSchedule: true } },
    };
    const refetchedMock = {
      request: { query: SCHEDULES_QUERY, variables: { engagementId: ENGAGEMENT_ID } },
      result: { data: { schedules: [] } },
    };

    renderTab([templatesMock, schedulesMock, deleteMock, refetchedMock]);

    await screen.findByText('nightly recon');
    fireEvent.click(screen.getByRole('button', { name: 'Delete schedule sch_1' }));

    await waitFor(() => expect(screen.getByText('No schedules yet.')).toBeInTheDocument());
  });
});
```

- [ ] **T5.2 — Run the test, verify it fails**

Run: `pnpm nx test frontend --testPathPattern=schedules-tab`
Expected: FAIL — cannot resolve `../schedules-tab`.

- [ ] **T5.3 — Implement `schedules-tab.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client';

import {
  CREATE_SCHEDULE_MUTATION,
  DELETE_SCHEDULE_MUTATION,
  SCAN_TEMPLATES_QUERY,
  SCHEDULES_QUERY,
  UPDATE_SCHEDULE_MUTATION,
} from '../../lib/graphql/queries';
import { formatDate } from '../../lib/format-date';

interface ScanTemplateRow {
  id: string;
  name: string;
  displayName: string;
}

interface ScheduleRow {
  id: string;
  name: string;
  cronExpr: string;
  timezone: string;
  targets: string[];
  enabled: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  templateId: string;
  template?: { id: string; displayName: string } | null;
}

interface Props {
  engagementId: string;
}

export function SchedulesTab({ engagementId }: Props) {
  const { data, loading, error, refetch } = useQuery<{ schedules: ScheduleRow[] }>(
    SCHEDULES_QUERY,
    { variables: { engagementId } },
  );
  const { data: tmplData, loading: tmplLoading } =
    useQuery<{ scanTemplates: ScanTemplateRow[] }>(SCAN_TEMPLATES_QUERY);

  const [createSchedule, { loading: creating, error: createError }] =
    useMutation(CREATE_SCHEDULE_MUTATION);
  const [updateSchedule] = useMutation(UPDATE_SCHEDULE_MUTATION);
  const [deleteSchedule] = useMutation(DELETE_SCHEDULE_MUTATION);

  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [cronExpr, setCronExpr] = useState('0 2 * * *');
  const [timezone, setTimezone] = useState('UTC');
  const [targets, setTargets] = useState('');

  // Pre-select the first template once the list loads.
  useEffect(() => {
    if (!templateId && tmplData?.scanTemplates?.length) {
      setTemplateId(tmplData.scanTemplates[0].id);
    }
  }, [tmplData, templateId]);

  const parsedTargets = targets
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const submitDisabled =
    creating || !templateId || name.trim().length === 0 || parsedTargets.length === 0;

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitDisabled) return;
    try {
      await createSchedule({
        variables: {
          input: { engagementId, templateId, name, cronExpr, timezone, targets: parsedTargets },
        },
      });
      setName('');
      setTargets('');
      await refetch();
    } catch {
      // surfaced via createError
    }
  }

  async function onToggle(s: ScheduleRow) {
    await updateSchedule({ variables: { id: s.id, input: { enabled: !s.enabled } } });
    await refetch();
  }

  async function onDelete(s: ScheduleRow) {
    await deleteSchedule({ variables: { id: s.id } });
    await refetch();
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onCreate}
        className="bg-slate-900 p-4 rounded grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        aria-label="create-schedule"
      >
        <label className="md:col-span-2">
          <span className="block text-xs text-slate-300">Template</span>
          <select
            aria-label="Template"
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={tmplLoading || !tmplData?.scanTemplates?.length}
            required
          >
            {!templateId ? <option value="">— select —</option> : null}
            {tmplData?.scanTemplates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="md:col-span-2">
          <span className="block text-xs text-slate-300">Name</span>
          <input
            aria-label="Name"
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nightly recon"
            required
          />
        </label>

        <label className="md:col-span-1">
          <span className="block text-xs text-slate-300">Cron</span>
          <input
            aria-label="Cron"
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={cronExpr}
            onChange={(e) => setCronExpr(e.target.value)}
            placeholder="0 2 * * *"
            required
          />
        </label>

        <label className="md:col-span-1">
          <span className="block text-xs text-slate-300">Timezone</span>
          <input
            aria-label="Timezone"
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="UTC"
          />
        </label>

        <label className="md:col-span-5">
          <span className="block text-xs text-slate-300">Targets (comma-separated)</span>
          <input
            aria-label="Targets"
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            placeholder="example.com, app.example.com"
            required
          />
        </label>

        <button
          type="submit"
          disabled={submitDisabled}
          className="md:col-span-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded py-2"
        >
          {creating ? 'Creating…' : 'Add schedule'}
        </button>

        {createError ? (
          <p className="md:col-span-6 text-sm text-red-400" role="alert">
            {createError.message}
          </p>
        ) : null}
      </form>

      {loading ? <p className="text-slate-400">Loading…</p> : null}
      {error ? (
        <p className="text-red-400" role="alert">
          {error.message}
        </p>
      ) : null}

      {data ? (
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr>
              <th className="py-2">Name</th>
              <th>Template</th>
              <th>Cron</th>
              <th>Timezone</th>
              <th>Next run</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.schedules.map((s) => (
              <tr key={s.id} className="border-t border-slate-800">
                <td className="py-2">{s.name}</td>
                <td>{s.template?.displayName ?? s.templateId}</td>
                <td className="font-mono text-xs">{s.cronExpr}</td>
                <td>{s.timezone}</td>
                <td>{s.nextRunAt ? formatDate(s.nextRunAt) : '—'}</td>
                <td>{s.enabled ? 'Enabled' : 'Disabled'}</td>
                <td className="text-right space-x-3">
                  <button
                    type="button"
                    onClick={() => onToggle(s)}
                    aria-label={`${s.enabled ? 'Disable' : 'Enable'} schedule ${s.id}`}
                    className="text-indigo-400 hover:underline"
                  >
                    {s.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(s)}
                    aria-label={`Delete schedule ${s.id}`}
                    className="text-red-400 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {data.schedules.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  No schedules yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
```

> **`formatDate` confirmed:** `apps/frontend/src/lib/format-date.ts` exports `formatDate(iso: string): string` — it takes the ISO string directly, so `formatDate(s.nextRunAt)` is correct as written (no `new Date(...)` wrapping needed).

- [ ] **T5.4 — Run the test, verify it passes**

Run: `pnpm nx test frontend --testPathPattern=schedules-tab`
Expected: PASS (all four `<SchedulesTab />` cases green).

- [ ] **T5.5 — Commit**

```bash
git add apps/frontend/src/features/schedules
git commit -m "feat(phase-5.2): SchedulesTab (list + create + enable/disable + delete)"
```

---

## T6 — Wire the Schedules tab into the engagement page

**Files:**
- Modify: `apps/frontend/src/features/engagements/engagement-page.tsx`

- [ ] **T6.1 — Add the import**

At the top with the other feature imports:

```ts
import { SchedulesTab } from '../schedules/schedules-tab';
```

- [ ] **T6.2 — Add `'schedules'` to the `TabKey` union and the `TABS` array**

In the `TabKey` union, add `| 'schedules'`. In the `TABS` array, append:

```ts
  { key: 'schedules', label: 'Schedules' },
```

- [ ] **T6.3 — Render the tab body**

In the `<section>` block, after the `correlated` line, add:

```tsx
        {tab === 'schedules' ? <SchedulesTab engagementId={engagementId} /> : null}
```

- [ ] **T6.4 — Run the existing engagement-page / routing tests to confirm no regression**

Run: `pnpm nx test frontend --testPathPattern="engagement-page|app-routing"`
Expected: PASS (no existing test asserts an exhaustive tab list; adding a tab is additive).

- [ ] **T6.5 — Commit**

```bash
git add apps/frontend/src/features/engagements/engagement-page.tsx
git commit -m "feat(phase-5.2): add Schedules tab to engagement page"
```

---

## T7 — Opt-in e2e (gated `SCHEDULER_E2E=1`)

**Files:**
- Create: `apps/api-gateway-e2e/src/scenarios/scheduler-graphql-e2e.spec.ts`

Mirror the gating pattern in `reporting-e2e.spec.ts`: skip unless `E2E_API_URL` + `E2E_EMAIL` + `E2E_PASSWORD` are set **and** `SCHEDULER_E2E=1`. The scenario exercises the GraphQL surface only (create → list → disable → delete); it does **not** require the scheduler worker to be running.

- [ ] **T7.1 — Create `scheduler-graphql-e2e.spec.ts`**

```ts
/**
 * Phase 5.2 acceptance: schedule CRUD over GraphQL.
 *
 * Scenario:
 *  1. Login + create a fresh engagement.
 *  2. Read `scanTemplates` to pick a templateId.
 *  3. `createSchedule` with cron `*​/5 * * * *` → assert nextRunAt is set.
 *  4. `schedules(engagementId)` contains the new row.
 *  5. `updateSchedule(enabled:false)` → assert enabled flips.
 *  6. `deleteSchedule` → assert it disappears from the list.
 *
 * Opt-in: skips unless E2E_API_URL + E2E_EMAIL + E2E_PASSWORD are set
 * AND `SCHEDULER_E2E=1`.
 *
 * Required env:
 *   E2E_API_URL    e.g. http://localhost:4000
 *   E2E_EMAIL      existing operator email
 *   E2E_PASSWORD   existing operator password
 *   SCHEDULER_E2E=1 explicit opt-in
 */

import type { GraphQLClient } from 'graphql-request';
import { authedGqlClient, createEngagement, describeOrSkipE2E, readBaseEnv, restLogin } from '../helpers';

const env = readBaseEnv();
const schedulerEnabled = process.env['SCHEDULER_E2E'] === '1';
const describeOrSkip = schedulerEnabled ? describeOrSkipE2E(env) : describe.skip;

interface ScheduleRow {
  id: string;
  name: string;
  enabled: boolean;
  nextRunAt: string | null;
}

const SCAN_TEMPLATES_QUERY = /* GraphQL */ `
  query ScanTemplates {
    scanTemplates {
      id
      name
    }
  }
`;

const CREATE_SCHEDULE = /* GraphQL */ `
  mutation CreateSchedule($input: CreateScheduleInput!) {
    createSchedule(input: $input) {
      id
      name
      enabled
      nextRunAt
    }
  }
`;

const SCHEDULES = /* GraphQL */ `
  query Schedules($engagementId: ID!) {
    schedules(engagementId: $engagementId) {
      id
      name
      enabled
      nextRunAt
    }
  }
`;

const UPDATE_SCHEDULE = /* GraphQL */ `
  mutation UpdateSchedule($id: ID!, $input: UpdateScheduleInput!) {
    updateSchedule(id: $id, input: $input) {
      id
      enabled
    }
  }
`;

const DELETE_SCHEDULE = /* GraphQL */ `
  mutation DeleteSchedule($id: ID!) {
    deleteSchedule(id: $id)
  }
`;

describeOrSkip('Scheduler GraphQL e2e', () => {
  let gql: GraphQLClient;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
  });

  it('creates, lists, disables, and deletes a schedule', async () => {
    const engagement = await createEngagement(gql, {
      name: `sched-e2e-${Date.now()}`,
      clientName: 'sched-e2e',
    });

    const { scanTemplates } = await gql.request<{ scanTemplates: { id: string }[] }>(
      SCAN_TEMPLATES_QUERY,
    );
    expect(scanTemplates.length).toBeGreaterThan(0);
    const templateId = scanTemplates[0].id;

    const { createSchedule } = await gql.request<{ createSchedule: ScheduleRow }>(CREATE_SCHEDULE, {
      input: {
        engagementId: engagement.id,
        templateId,
        name: 'e2e nightly',
        cronExpr: '*/5 * * * *',
        timezone: 'UTC',
        targets: ['example.com'],
      },
    });
    expect(createSchedule.nextRunAt).toBeTruthy();
    const scheduleId = createSchedule.id;

    const listed = await gql.request<{ schedules: ScheduleRow[] }>(SCHEDULES, {
      engagementId: engagement.id,
    });
    expect(listed.schedules.map((s) => s.id)).toContain(scheduleId);

    const { updateSchedule } = await gql.request<{ updateSchedule: ScheduleRow }>(UPDATE_SCHEDULE, {
      id: scheduleId,
      input: { enabled: false },
    });
    expect(updateSchedule.enabled).toBe(false);

    const { deleteSchedule } = await gql.request<{ deleteSchedule: boolean }>(DELETE_SCHEDULE, {
      id: scheduleId,
    });
    expect(deleteSchedule).toBe(true);

    const afterDelete = await gql.request<{ schedules: ScheduleRow[] }>(SCHEDULES, {
      engagementId: engagement.id,
    });
    expect(afterDelete.schedules.map((s) => s.id)).not.toContain(scheduleId);
  });
});
```

> **Helper signatures confirmed** against `apps/api-gateway-e2e/src/helpers/auth.ts` and `reporting-e2e.spec.ts`: `restLogin(apiUrl, email, password)` returns an `AuthPayload` (`{ accessToken, ... }`), and `authedGqlClient(apiUrl, accessToken)` returns a `GraphQLClient`. The `beforeAll` above uses `auth.accessToken` accordingly.

- [ ] **T7.2 — Type-check the e2e project (the suite stays skipped without the env gate)**

Run: `pnpm nx run-many -t lint,type-check -p api-gateway-e2e`
Expected: PASS. The `describe.skip` keeps the scenario from executing in plain CI.

- [ ] **T7.3 — Commit**

```bash
git add apps/api-gateway-e2e/src/scenarios/scheduler-graphql-e2e.spec.ts
git commit -m "test(phase-5.2): scheduler GraphQL e2e (opt-in SCHEDULER_E2E)"
```

---

## T8 — Full validation

- [ ] **T8.1 — Run the affected projects green**

Run: `pnpm nx run-many -t lint,type-check,test -p api-gateway,frontend,api-gateway-e2e`
Expected: PASS across all three.

- [ ] **T8.2 — Confirm the GraphQL schema is committed and up to date**

Run: `git status --porcelain apps/api-gateway/src/schema.gql`
Expected: clean (the regenerated schema from T3.4 was committed). If dirty, the schema changed since — review and commit it.

- [ ] **T8.3 — Manual smoke (optional, requires `pnpm dev:up`)**
  - Bring the stack up; log in; open an engagement; click the **Schedules** tab.
  - Add a schedule (`recon-passive` template, cron `*/5 * * * *`, target a scoped domain). Confirm it appears with a **Next run** timestamp.
  - Click **Disable**, confirm status flips to `Disabled`. Click **Delete**, confirm it vanishes.
  - (If the scheduler worker is running) wait one cron interval and confirm a `TemplateRun` row appears for the schedule (`scheduleId` set).

- [ ] **T8.4 — Final commit (if any uncommitted leftovers)**

```bash
git add -A
git commit -m "chore(phase-5.2): finalize scheduler GraphQL + UI"
```

---

## Validation criteria (spec §5.2)

- ✅ Vitest frontend: the `Schedules` tab renders a list, and the form creates a schedule via the mutation (T5).
- ✅ E2E gated `SCHEDULER_E2E=1`: create a schedule, list it, disable, delete (T7).
- ✅ UI: create a schedule on an engagement, see `nextRunAt`, disable it (T5/T6/T8.3).

---

## Out of scope (Phase 5.2)

- **Enqueue / cron firing** — owned by the Phase 5.1 `apps/scheduler` hydrator. This phase only writes `Schedule` rows; `nextRunAt` is computed for display and as the hydrator's first-tick seed.
- **Per-target scope validation** on `createSchedule` — the hydrator already enqueues without a scope check; matching that, the create mutation validates engagement ownership + template existence + cron validity only. (Revisit if scope enforcement is desired for scheduled runs; would reuse `TemplatesService.isTargetInScope`.)
- **Notifications** on scheduled-run completion (`schedule.finished` event) — Phase 5.3.
- **Drag-and-drop / visual cron builder** — V2 (spec §1 non-buts).
- **Overlap prevention** for very-short crons — V2 (`Schedule.preventOverlap`).
- **A standalone `/schedules` route** — schedules are surfaced as an engagement tab (consistent with assets/endpoints/findings/correlated). A top-level route can be added later if cross-engagement scheduling is needed.

---

## Self-review notes

- **Spec coverage (§5.2):** GraphQL `Mutation/Query schedules` → T2/T3; page/tab `/schedules` → T5/T6; "create on an engagement, see nextRunAt, disable" → T5 form + `nextRunAt` column + toggle; Vitest → T5; gated e2e → T7. ✅
- **Type consistency:** `ScheduleObject` fields ↔ `SCHEDULES_QUERY` selection ↔ `ScheduleRow` interfaces all use `cronExpr`, `timezone`, `targets`, `enabled`, `nextRunAt`, `templateId`, `template.displayName`. Service method names (`create`, `listForOwner`, `getForOwner`, `update`, `softDelete`) match resolver calls. Mutation/query names (`createSchedule`, `updateSchedule`, `deleteSchedule`, `schedules`, `schedule`) match across resolver, frontend docs, and e2e. ✅
- **No new migration:** `Schedule` model + migration already shipped in Phase 5.1 — verified in `prisma/schema.prisma` and `prisma/migrations/20260612200000_phase5_schedule`. ✅
- **External signatures pinned:** `formatDate(iso: string)` (T5.3) and the e2e helpers `restLogin(...) => AuthPayload` / `authedGqlClient(apiUrl, accessToken)` (T7.1) were verified against source — no open verify-before-use items remain.
