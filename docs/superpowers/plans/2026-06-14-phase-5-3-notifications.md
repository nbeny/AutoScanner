# Phase 5.3 — Notifications (foundations + worker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

> **Date:** 2026-06-14
> **Spec:** `docs/superpowers/specs/2026-06-12-phase-5-scheduler-notifications-agents-design.md` §2 (5.3), §3.1 (models), §3.2 (queues), §3.4 (event sourcing), §4 (security), §5.3.
> **Branch:** `phase-5-3-notifications` (off `main` @ `8cb6640`).

**Goal:** When a scan/template-run completes (or a report is ready), operators receive a notification on their configured channels (EMAIL/SLACK/DISCORD/WEBHOOK), and can manage channels + view a delivery log in the UI.

**Architecture:** A durable BullMQ pipeline. Producers call a shared `NotificationsFanoutService.fanout(eventType, engagementId, payload)` which finds the engagement owner's active channels whose `eventFilters` include the event, creates a `Notification` row (PENDING) per channel, and enqueues `notification-jobs` with `{ notificationId }`. The new `apps/notification-worker` consumes those jobs, decrypts the channel config (AES-GCM `SecretBox` via existing `MASTER_ENCRYPTION_KEY`), dispatches via a per-type adapter, and updates `DeliveryStatus`. GraphQL `notifications` module manages channels (never returning the secret) + `testNotificationChannel`. A frontend Notifications tab does channel CRUD + delivery log.

**Tech Stack:** NestJS 10, Prisma, BullMQ (`@nestjs/bullmq`), `@autoscanner/common` `SecretBox` (AES-256-GCM), `nodemailer` (injected transport), React + Apollo, Jest, Vitest.

---

## Pre-requisites / context

- **Encryption:** reuse `SecretBox` from `@autoscanner/common` (`seal(plaintext): Buffer` / `open(Buffer): string`), keyed by `cfg.env.MASTER_ENCRYPTION_KEY` (already in the env schema). Mirror `apps/api-gateway/src/app/api-credentials/secret-box.provider.ts` for DI. **Do NOT** introduce a separate `NOTIFICATIONS_ENCRYPTION_KEY` (spec suggested one; we consolidate on the master key, consistent with api-credentials — note this deviation).
- **Queues:** add a queue by editing `libs/queues/src/queue-names.ts`, `job-payloads.ts`, and `queues.module.ts` (register). Mirror the existing `REPORT_JOBS` entries.
- **Worker app skeleton:** mirror `apps/report-worker` (main.ts `NestFactory.createApplicationContext`, app.module imports `AppConfigModule, AppLoggingModule, PrismaModule, QueuesModule`, a `@Processor(QueueName.X) extends WorkerHost` provider). Copy `apps/report-worker/project.json`, `tsconfig*.json`, `jest.config.ts`, `webpack.config.js` and adapt the name.
- **Producers to wire:** `apps/orchestrator-worker/src/app/template-run.processor.ts` sets TemplateRun → `COMPLETED` (line ~105) and `FAILED` (line ~122), each followed by `this.publishStatusChange(...)`. `apps/report-worker/src/app/report.processor.ts` sets Report → `READY` (line ~95). These are the fan-out injection points.
- **Ownership:** a `NotificationChannel` belongs to a `User`. The producer knows `engagementId`; resolve the owner via `engagement.ownerId`. Notifications are sent to the engagement owner's channels.
- **GraphQL module pattern:** mirror `apps/api-gateway/src/app/api-credentials/` (it already does encrypt-on-write + never-return-secret) and the `reports`/`schedules` modules.
- **Frontend pattern:** GraphQL docs in `apps/frontend/src/lib/graphql/queries.ts`; a feature folder under `apps/frontend/src/features/`; settings-style page exists at `apps/frontend/src/features/settings/settings-page.tsx` (+ `api-keys-panel.tsx`) — a good analog for a channels panel.
- **Nx lib scaffolding:** to create `libs/notifications`, mirror an existing simple lib (`libs/insight`): copy its `project.json`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `jest.config.ts`, rename `name`/paths, and add the path alias `@autoscanner/notifications` to `tsconfig.base.json` `compilerOptions.paths` (mirror the `@autoscanner/insight` entry).

---

## File Structure

**Prisma / queues:**
- Modify `prisma/schema.prisma` — add `NotificationChannel`, `Notification`, enums `NotificationChannelType`, `DeliveryStatus`; add `User.notificationChannels`.
- Create migration `prisma/migrations/<ts>_phase5_notifications/migration.sql`.
- Modify `libs/queues/src/queue-names.ts`, `job-payloads.ts`, `queues.module.ts`.

**New lib `libs/notifications/src/`:**
- `event-types.ts` — `NotificationEventType` enum + `NotificationEventPayload` + `renderNotificationMessage()`.
- `channel-config.ts` — decrypted config types per channel type + `parseChannelConfig`.
- `adapters/adapter.types.ts` — `NotificationAdapter` interface + `MailTransport` interface.
- `adapters/email.adapter.ts`, `slack.adapter.ts`, `discord.adapter.ts`, `generic-webhook.adapter.ts`.
- `notification-dispatcher.ts` — selects adapter by channel type.
- `notifications-fanout.service.ts` — Prisma + queue: create rows + enqueue.
- `index.ts` + tests under `__tests__/`.

**New worker `apps/notification-worker/src/`:**
- `main.ts`, `app/app.module.ts`, `app/notification.processor.ts`, `app/notification-adapters.module.ts` (provides transports/adapters), `app/__tests__/notification.processor.spec.ts`.

**api-gateway `apps/api-gateway/src/app/notifications/`:**
- `dto/` (`notification-channel.object.ts`, `notification.object.ts`, `create-notification-channel.input.ts`, `update-notification-channel.input.ts`, enums), `notifications.service.ts`, `notifications.resolver.ts`, `notifications.module.ts`, `secret-box.provider.ts` (or reuse api-credentials' symbol), tests. Register in `app.module.ts`.

**Frontend:**
- `apps/frontend/src/features/notifications/notifications-tab.tsx` (+ test); GraphQL docs in `queries.ts`; wire into engagement page or settings page.

**E2E:**
- `apps/api-gateway-e2e/src/scenarios/notifications-e2e.spec.ts` (gated `NOTIFICATIONS_E2E`).

---

## T1 — Prisma models + enums + queue wiring

**Files:** `prisma/schema.prisma`, migration, `libs/queues/src/*`.

- [ ] **T1.1** — In `prisma/schema.prisma`, after the `Schedule` model, add:

```prisma
enum NotificationChannelType { EMAIL SLACK DISCORD WEBHOOK }
enum DeliveryStatus { PENDING SENT FAILED }

model NotificationChannel {
  id              String  @id @default(cuid())
  userId          String
  name            String
  type            NotificationChannelType
  configEncrypted Bytes
  enabled         Boolean @default(true)
  eventFilters    String[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  user            User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  notifications   Notification[]

  @@index([userId])
  @@index([deletedAt])
}

model Notification {
  id             String @id @default(cuid())
  channelId      String
  eventType      String
  payload        Json
  deliveryStatus DeliveryStatus @default(PENDING)
  attemptCount   Int    @default(0)
  lastAttemptAt  DateTime?
  errorMessage   String?
  sentAt         DateTime?
  createdAt      DateTime @default(now())

  channel        NotificationChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@index([channelId, createdAt(sort: Desc)])
  @@index([deliveryStatus])
}
```

- [ ] **T1.2** — Add to `model User`: `notificationChannels NotificationChannel[]`.
- [ ] **T1.3** — Generate migration: `pnpm prisma migrate dev --name phase5_notifications` (fallback `--create-only` if no DB, then hand-write SQL mirroring the model). Then `pnpm prisma generate`.
- [ ] **T1.4** — `libs/queues/src/queue-names.ts`: add `NOTIFICATION_JOBS: 'notification-jobs',`.
- [ ] **T1.5** — `libs/queues/src/job-payloads.ts`: add `export interface NotificationJobPayload { notificationId: string; }` and add to `QueuePayloadMap`: `[QueueName.NOTIFICATION_JOBS]: NotificationJobPayload;`.
- [ ] **T1.6** — `libs/queues/src/queues.module.ts`: add `{ name: QueueName.NOTIFICATION_JOBS },` to `registerQueue`.
- [ ] **T1.7** — Verify: `pnpm nx run-many -t type-check -p queues,database` green. Commit: `feat(phase-5.3): notification Prisma models + notification-jobs queue`.

---

## T2 — `libs/notifications` scaffold + event types + message rendering (TDD)

- [ ] **T2.1** — Scaffold `libs/notifications` by copying `libs/insight`'s `project.json`, `tsconfig*.json`, `jest.config.ts` and renaming to `notifications`/`@autoscanner/notifications`. Add path alias `"@autoscanner/notifications": ["libs/notifications/src/index.ts"]` to `tsconfig.base.json` (mirror the insight entry). Create `src/index.ts`.

- [ ] **T2.2** — Write failing test `libs/notifications/src/__tests__/event-types.spec.ts` covering: `NotificationEventType` has the 5 values; `renderNotificationMessage` produces a `{ subject, body }` for `SCAN_COMPLETED` containing the engagement name and scan id; unknown event falls back to a generic message.

- [ ] **T2.3** — Implement `src/event-types.ts`:

```ts
export enum NotificationEventType {
  SCAN_COMPLETED = 'scan.completed',
  SCAN_FAILED = 'scan.failed',
  FINDING_CRITICAL = 'finding.critical',
  REPORT_READY = 'report.ready',
  SCHEDULE_FINISHED = 'schedule.finished',
}

export interface NotificationEventPayload {
  engagementId: string;
  engagementName?: string;
  scanId?: string;
  templateRunId?: string;
  reportId?: string;
  findingId?: string;
  severity?: string;
  [k: string]: unknown;
}

export interface RenderedMessage {
  subject: string;
  body: string;
}

export function renderNotificationMessage(
  eventType: NotificationEventType,
  payload: NotificationEventPayload,
): RenderedMessage {
  const eng = payload.engagementName ?? payload.engagementId;
  switch (eventType) {
    case NotificationEventType.SCAN_COMPLETED:
      return { subject: `Scan completed — ${eng}`, body: `A scan completed for engagement "${eng}" (run ${payload.templateRunId ?? payload.scanId ?? 'n/a'}).` };
    case NotificationEventType.SCAN_FAILED:
      return { subject: `Scan failed — ${eng}`, body: `A scan failed for engagement "${eng}" (run ${payload.templateRunId ?? payload.scanId ?? 'n/a'}).` };
    case NotificationEventType.FINDING_CRITICAL:
      return { subject: `Critical finding — ${eng}`, body: `A CRITICAL finding was raised for engagement "${eng}".` };
    case NotificationEventType.REPORT_READY:
      return { subject: `Report ready — ${eng}`, body: `A report is ready for engagement "${eng}" (report ${payload.reportId ?? 'n/a'}).` };
    case NotificationEventType.SCHEDULE_FINISHED:
      return { subject: `Schedule finished — ${eng}`, body: `A scheduled run finished for engagement "${eng}".` };
    default:
      return { subject: `Notification — ${eng}`, body: `Event ${String(eventType)} for engagement "${eng}".` };
  }
}
```

- [ ] **T2.4** — Run the test, green. Export from `index.ts`. Commit: `feat(phase-5.3): notifications lib scaffold + event types + message rendering`.

---

## T3 — Adapters + dispatcher (TDD)

Each adapter takes a decrypted config + a `RenderedMessage` and performs delivery. Email uses an injected `MailTransport`; Slack/Discord/Webhook use `fetch` (POST JSON). All are pure enough to unit-test with mocks.

- [ ] **T3.1** — `src/adapters/adapter.types.ts`:

```ts
import type { NotificationChannelType } from '@prisma/client';
import type { RenderedMessage } from '../event-types';

export interface MailTransport {
  sendMail(opts: { to: string; from: string; subject: string; text: string }): Promise<void>;
}

export interface DeliveryContext {
  type: NotificationChannelType;
  config: Record<string, unknown>; // decrypted
  message: RenderedMessage;
}

export interface NotificationAdapter {
  readonly type: NotificationChannelType;
  send(ctx: DeliveryContext): Promise<void>;
}
```

- [ ] **T3.2** — Implement adapters (one file each) with TDD. Required config keys + behavior:
  - `EmailAdapter` (`type: 'EMAIL'`): config `{ to: string, from?: string }`; calls `transport.sendMail({ to, from: config.from ?? defaultFrom, subject, text: body })`. Constructor takes `(private transport: MailTransport, private defaultFrom: string)`.
  - `SlackAdapter` (`'SLACK'`): config `{ webhookUrl: string }`; `fetch(webhookUrl, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ text: `*${subject}*\n${body}` }) })`; throw if `!res.ok`.
  - `DiscordAdapter` (`'DISCORD'`): config `{ webhookUrl }`; POST `{ content: `**${subject}**\n${body}` }`; throw if `!res.ok`.
  - `GenericWebhookAdapter` (`'WEBHOOK'`): config `{ url, secret? }`; POST `{ subject, body }` with header `x-autoscanner-signature` = hmac-sha256(secret, body) when secret present; throw if `!res.ok`.
  - Tests: mock `MailTransport` and `global.fetch` (assert URL/body; assert throw on non-2xx). Use `jest.spyOn(global, 'fetch')`.

- [ ] **T3.3** — `src/notification-dispatcher.ts`: `NotificationDispatcher` holds `adapters: NotificationAdapter[]`, `dispatch(type, config, message)` finds the adapter by `type` (throw `Error('no adapter for <type>')` if none) and calls `send`. TDD: dispatch routes to the right adapter; unknown type throws.

- [ ] **T3.4** — Export all from `index.ts`. Green tests. Commit: `feat(phase-5.3): notification adapters (email/slack/discord/webhook) + dispatcher`.

---

## T4 — `NotificationsFanoutService` (TDD)

Injectable used by producers. Given an event, create Notification rows for matching channels and enqueue.

- [ ] **T4.1** — `src/notifications-fanout.service.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@autoscanner/database';
import { QueueName, type NotificationJobPayload } from '@autoscanner/queues';
import { NotificationEventType, type NotificationEventPayload } from './event-types';

@Injectable()
export class NotificationsFanoutService {
  private readonly logger = new Logger(NotificationsFanoutService.name);
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QueueName.NOTIFICATION_JOBS) private readonly queue: Queue<NotificationJobPayload>,
  ) {}

  async fanout(eventType: NotificationEventType, payload: NotificationEventPayload): Promise<number> {
    const engagement = await this.prisma.engagement.findUnique({
      where: { id: payload.engagementId },
      select: { ownerId: true, name: true },
    });
    if (!engagement) return 0;

    const channels = await this.prisma.notificationChannel.findMany({
      where: {
        userId: engagement.ownerId,
        enabled: true,
        deletedAt: null,
        eventFilters: { has: eventType },
      },
      select: { id: true },
    });
    if (channels.length === 0) return 0;

    const enriched = { ...payload, engagementName: payload.engagementName ?? engagement.name };
    let enqueued = 0;
    for (const ch of channels) {
      const notif = await this.prisma.notification.create({
        data: { channelId: ch.id, eventType, payload: enriched as Prisma.InputJsonValue },
        select: { id: true },
      });
      try {
        await this.queue.add('notify', { notificationId: notif.id });
        enqueued++;
      } catch (err) {
        this.logger.warn(`enqueue failed for notification=${notif.id}: ${(err as Error).message}`);
      }
    }
    this.logger.log(`fanout ${eventType} eng=${payload.engagementId}: ${enqueued}/${channels.length}`);
    return enqueued;
  }
}
```

Also create `NotificationsFanoutModule` (a `@Module` that imports nothing extra — relies on global `QueuesModule` + `PrismaModule` provided by the host app; `providers: [NotificationsFanoutService]`, `exports: [NotificationsFanoutService]`). Put it in the lib and export it.

- [ ] **T4.2** — TDD test (mock Prisma + queue): (1) no engagement → returns 0, no create; (2) no matching channels → 0; (3) 2 matching channels → 2 notification.create + 2 queue.add; (4) `eventFilters` filter uses `{ has: eventType }`; (5) enqueue throw is swallowed (row still created). Green. Commit: `feat(phase-5.3): NotificationsFanoutService`.

---

## T5 — `apps/notification-worker` (TDD)

- [ ] **T5.1** — Scaffold the app by copying `apps/report-worker` config files (`project.json`, `tsconfig*.json`, `jest.config.ts`, `webpack.config.js`) renamed to `notification-worker`. `main.ts` mirrors report-worker (logs `notification-worker started`).

- [ ] **T5.2** — `app/notification-adapters.module.ts`: provides a `MailTransport` (built from `cfg.env.SMTP_URL` via nodemailer if set, else a no-op/throwing stub that logs), the four adapters, and a `NotificationDispatcher` wired with all adapters + `DEFAULT_FROM` (`cfg.env.NOTIFICATIONS_FROM ?? 'autoscanner@localhost'`). Also provide `SECRET_BOX` (mirror api-credentials secret-box.provider using `MASTER_ENCRYPTION_KEY`). Add `SMTP_URL` (optional) and `NOTIFICATIONS_FROM` (optional) to `libs/config/src/env.schema.ts` as `.optional()`, and to `env.schema.spec.ts` validEnv if needed.

- [ ] **T5.3** — `app/notification.processor.ts`: `@Processor(QueueName.NOTIFICATION_JOBS) extends WorkerHost`. `process(job)`:
  1. Load `Notification` by `job.data.notificationId` including `channel`. If missing or channel `deletedAt`/`!enabled` → mark `FAILED` with reason, return.
  2. Decrypt `channel.configEncrypted` via `SecretBox.open` → `JSON.parse` → config object.
  3. `renderNotificationMessage(notification.eventType as NotificationEventType, notification.payload)`.
  4. Update attemptCount++, lastAttemptAt=now.
  5. `dispatcher.dispatch(channel.type, config, message)`.
  6. On success: update `deliveryStatus=SENT, sentAt=now`. On throw: update `deliveryStatus=FAILED, errorMessage=...` and rethrow (so BullMQ retry policy applies).

- [ ] **T5.4** — `app/app.module.ts`: imports `AppConfigModule, AppLoggingModule, PrismaModule, QueuesModule, NotificationAdaptersModule`; providers `[NotificationProcessor]`.

- [ ] **T5.5** — TDD `notification.processor.spec.ts` (mock Prisma, dispatcher, secretbox): (1) happy path EMAIL → dispatch called, status SENT; (2) channel disabled/deleted → FAILED, dispatch not called; (3) dispatch throws → status FAILED + rethrow; (4) decrypt config passed to dispatch.

- [ ] **T5.6** — Add `nodemailer` + `@types/nodemailer` to root `package.json` deps. `pnpm install`. Verify `pnpm nx run-many -t type-check,test -p notification-worker,notifications`. Commit: `feat(phase-5.3): notification-worker (consume notification-jobs, deliver, status)`.

---

## T6 — Wire producers (orchestrator + report-worker)

Inject `NotificationsFanoutService` into the two processors and fire on terminal transitions. Keep changes minimal; tests for these processors must be updated to provide the new dependency (a mock fanout).

- [ ] **T6.1** — `apps/orchestrator-worker/src/app/app.module.ts`: import `NotificationsFanoutModule` from `@autoscanner/notifications`. In `template-run.processor.ts`, inject `NotificationsFanoutService`. After the `COMPLETED` update + `publishStatusChange` (line ~112), call (fire-and-forget, error-swallowed):

```ts
await this.fanout
  .fanout(NotificationEventType.SCAN_COMPLETED, {
    engagementId: run.engagementId,
    templateRunId: run.id,
  })
  .catch((e) => this.logger.warn(`notification fanout failed: ${(e as Error).message}`));
```

And after the `FAILED` update (line ~136) the same with `SCAN_FAILED`.

- [ ] **T6.2** — `apps/report-worker/src/app/app.module.ts`: import `NotificationsFanoutModule`. In `report.processor.ts`, inject `NotificationsFanoutService`; after Report→READY (line ~95) call `fanout(REPORT_READY, { engagementId: report.engagementId, reportId: report.id })` (error-swallowed).

- [ ] **T6.3** — Update the affected processor specs (`template-run.processor.spec.ts`, `report.processor.spec.ts`) to provide a mocked `NotificationsFanoutService` (`{ fanout: jest.fn().mockResolvedValue(0) }`) and assert it's called with the right event type on terminal transitions.

- [ ] **T6.4** — Verify `pnpm nx run-many -t type-check,test -p orchestrator-worker,report-worker`. Commit: `feat(phase-5.3): emit scan.completed/failed + report.ready notifications`.

---

## T7 — GraphQL `notifications` module (TDD)

Mirror `api-credentials` (encrypt-on-write, never return secret) + `schedules` (CRUD/ownership).

- [ ] **T7.1** — DTOs:
  - `NotificationChannelType` + `DeliveryStatus` GraphQL enums (`registerEnumType`).
  - `NotificationChannelObject`: `id, name, type, enabled, eventFilters [String], createdAt, updatedAt`. **No config field.**
  - `NotificationObject`: `id, channelId, eventType, deliveryStatus, attemptCount, lastAttemptAt, errorMessage, sentAt, createdAt`.
  - `CreateNotificationChannelInput`: `name, type, eventFilters [String!]! (min 1), config GraphQLJSON` (the plaintext config object, e.g. `{ webhookUrl }` / `{ to }`).
  - `UpdateNotificationChannelInput`: all optional (`name?, enabled?, eventFilters?, config?`).

- [ ] **T7.2** — `notifications.service.ts` (inject `PrismaService` + `SECRET_BOX`): 
  - `create(userId, input)`: validate `eventFilters` non-empty; `seal(JSON.stringify(input.config))` → store `configEncrypted`.
  - `listChannels(userId)`: `findMany({ where: { userId, deletedAt: null }, orderBy createdAt desc })`.
  - `update(userId, id, input)`: ownership check; re-encrypt config if provided.
  - `softDelete(userId, id)`: ownership check; set `deletedAt`.
  - `listNotifications(userId, channelId)`: delivery log, ownership-scoped via channel.userId, latest 100.
  - `testChannel(userId, id)`: load channel (ownership), create a `Notification` (eventType `'test'`, payload `{ engagementId: 'test', engagementName: 'Test' }`) and enqueue `notification-jobs` `{ notificationId }`. Returns the Notification. (Requires `@InjectQueue(NOTIFICATION_JOBS)`.) Note: rendering falls to the generic default branch for `'test'`.
  - TDD: create encrypts (assert `seal` called, `configEncrypted` is the sealed buffer); list never exposes config; update re-encrypts; ownership NotFound; testChannel enqueues.

- [ ] **T7.3** — `notifications.resolver.ts` (`@UseGuards(JwtAuthGuard)`, `@CurrentUser()`): mutations `createNotificationChannel`, `updateNotificationChannel`, `deleteNotificationChannel(Boolean)`, `testNotificationChannel(id): NotificationObject`; queries `notificationChannels: [NotificationChannelObject]`, `channelDeliveries(channelId): [NotificationObject]`.

- [ ] **T7.4** — `notifications.module.ts` (imports `[AuthModule]`, provides service+resolver+secret-box provider; needs `QueuesModule` — it's `@Global` so available). Register `NotificationsModule` in `app.module.ts`. Regenerate schema implicitly at build (gitignored).

- [ ] **T7.5** — Verify `pnpm nx run-many -t type-check,test -p api-gateway`. Commit: `feat(phase-5.3): GraphQL notifications channel CRUD + testNotificationChannel`.

---

## T8 — Frontend Notifications UI (TDD)

- [ ] **T8.1** — Add GraphQL docs to `queries.ts`: `NOTIFICATION_CHANNELS_QUERY`, `CREATE_NOTIFICATION_CHANNEL_MUTATION`, `UPDATE_NOTIFICATION_CHANNEL_MUTATION`, `DELETE_NOTIFICATION_CHANNEL_MUTATION`, `TEST_NOTIFICATION_CHANNEL_MUTATION`, `CHANNEL_DELIVERIES_QUERY`.

- [ ] **T8.2** — `apps/frontend/src/features/notifications/notifications-tab.tsx`: 
  - List channels (name, type, enabled, eventFilters) with Disable/Enable, Delete, **Send test** buttons.
  - Create form: name, type `<select>` (EMAIL/SLACK/DISCORD/WEBHOOK), eventFilters (checkbox group of the 5 event types, ≥1 required), and a config input that adapts to type (EMAIL → "to" email; SLACK/DISCORD → "webhook URL"; WEBHOOK → "url" + optional "secret"). Build the `config` object accordingly.
  - TDD (Vitest + MockedProvider): renders channels; creates a SLACK channel (assert mutation variables: `{ input: { name, type:'SLACK', eventFilters:['scan.completed'], config:{ webhookUrl } } }`); send-test calls the test mutation.

- [ ] **T8.3** — Wire into the engagement page as a "Notifications" tab **or** the settings page. Recommended: settings page (channels are per-user, not per-engagement) — add a `NotificationsTab`/panel to `settings-page.tsx`. Follow the existing `api-keys-panel` integration.

- [ ] **T8.4** — Verify `pnpm nx run-many -t type-check,test -p frontend`. Commit: `feat(phase-5.3): notifications UI (channel CRUD + send test + delivery log)`.

---

## T9 — Opt-in e2e (`NOTIFICATIONS_E2E=1`)

- [ ] **T9.1** — `apps/api-gateway-e2e/src/scenarios/notifications-e2e.spec.ts` gated by base env + `NOTIFICATIONS_E2E=1` (mirror reporting-e2e). Scenario: create a WEBHOOK channel pointing at a local capture URL (or just assert the channel CRUD + `testNotificationChannel` returns a Notification row and `channelDeliveries` lists it). Minimal viable: create channel → testNotificationChannel → poll `channelDeliveries` until `deliveryStatus` is `SENT` or `FAILED` → assert a row exists. Type-check only (suite stays skipped). Commit: `test(phase-5.3): notifications e2e (opt-in NOTIFICATIONS_E2E)`.

---

## T10 — Integration, env, dev:up, validation

- [ ] **T10.1** — Add to `.env.example`: `SMTP_URL=` (commented), `NOTIFICATIONS_FROM=autoscanner@localhost`. (MASTER_ENCRYPTION_KEY already documented.)
- [ ] **T10.2** — Add `notification-worker` to the `dev:up` script in root `package.json` (mirror how report-worker is launched).
- [ ] **T10.3** — Full validation: `pnpm nx run-many -t lint,type-check,test -p queues,database,notifications,notification-worker,orchestrator-worker,report-worker,api-gateway,frontend,api-gateway-e2e`. All green.
- [ ] **T10.4** — Commit any remaining; ready for merge to `main`.

---

## Validation criteria (spec §5.3)
- `NotificationDispatcher`/adapter unit tests: event + active channel → POST/sendMail invoked (T3).
- Worker delivers and transitions PENDING → SENT/FAILED (T5).
- Channel CRUD via GraphQL + UI, secrets never returned (T7/T8).
- Producers emit scan.completed/failed + report.ready (T6).

## Out of scope (V1)
- `finding.critical` producer wiring (parser-worker) — the event type + rendering exist, but wiring the parser-worker producer is deferred; fanout works if called.
- `schedule.finished` producer wiring — deferred (scheduler app); event type exists.
- Handlebars templating in bodies — static messages with variables only.
- Digest/batching — 1 event ⇒ N notifications (one per channel).
- Key rotation for `configEncrypted`.

## Self-review notes
- Spec coverage: models+migration (T1), worker+adapters (T3/T5), event sourcing/fanout (T4/T6), GraphQL CRUD + no-secret (T7), UI (T8), e2e (T9). ✅
- Encryption consolidated on `MASTER_ENCRYPTION_KEY` (documented deviation from spec's separate key).
- Queue payload `{ notificationId }` matches spec §3.2.
- Type consistency: `NotificationEventType` string values match across fanout, processor, GraphQL eventFilters, frontend checkboxes.
