# Global Dashboard — Design

**Date:** 2026-06-18
**Status:** Approved (autonomous execution authorized by operator)
**Author:** Claude (Opus 4.8)

## Problem

After login the operator lands on `/engagements`, a bare table (name / client / status / Open link). There is **no cross-engagement overview**: to know "what is going on across everything" the operator must open each engagement and read its Overview tab one by one.

Every insight query today is per-engagement (`engagementOverview(engagementId)`, `topFindings(engagementId)`, …). There is no global aggregation and no landing dashboard.

## Goal

Add a real **global dashboard** as the post-login landing page that gives complete visibility across all of the operator's engagements in one screen: totals, severity posture, attack surface, live activity, and a per-engagement summary grid. Make it the substantial "command center" the operator opens first.

Non-goals (YAGNI): no date-range filtering, no customizable widgets, no charts library, no real-time websocket refresh on the dashboard (a manual refresh + normal Apollo cache is enough for v1), no multi-user/team views (single-operator product).

## Architecture

Mirror the existing `insight` slice exactly — data-access in `libs/insight`, owner-scoped service + GraphQL resolver in `apps/api-gateway/src/app/insight`, React consumers in `apps/frontend/src/features/dashboard`. All new queries are **owner-scoped with no `engagementId` argument**; they aggregate over `engagement.ownerId = user.id, deletedAt: null`.

### Backend — `libs/insight`

Three new pure functions, each taking `(prisma, ownerId)` and reusing the same Prisma patterns already in `get-engagement-overview.ts`:

1. **`getGlobalOverview(prisma, ownerId): GlobalOverview`**
   - `engagementsByStatus`: counts per `EngagementStatus` (DRAFT/ACTIVE/PAUSED/COMPLETED/ARCHIVED) + `total`
   - `domains`, `subdomains`, `ipAddresses`, `openPorts`, `uniqueTechs` — same counts as engagement overview but scoped to all owned engagements
   - `findingsBySeverity`: global `SeverityCounts`
   - `activeSchedules`: count of enabled schedules across owned engagements
   - `runningScans`: count of scans with status RUNNING/QUEUED across owned engagements
   - Implementation: one `engagement.findMany({ where: { ownerId, deletedAt: null }, select: { id: true } })` to get the owned id list, then the same `count`/`groupBy` queries filtered by `engagementId: { in: ids }` (or the existing relation filters), run in `Promise.all`. Returns zeroes when the operator owns no engagements.

2. **`getRecentActivity(prisma, ownerId, limit): ActivityItem[]`**
   - Unified recent feed across owned engagements. Each item: `{ id, kind: 'TEMPLATE_RUN' | 'SCAN', engagementId, engagementName, label, status, ts }` where `ts` is the most relevant timestamp (completedAt ?? startedAt ?? createdAt).
   - Pull the most recent N template runs and N scans (each ordered desc, scoped to owned engagement ids, joined to engagement name), merge, sort by `ts` desc, slice to `limit`. `limit` clamped 1–50, default 15.

3. **`getEngagementSummaries(prisma, ownerId): EngagementSummary[]`**
   - One card row per owned engagement: `{ id, name, clientName, status, createdAt, assetCount, findingsBySeverity, lastActivityAt }`.
   - `lastActivityAt` = max(latest scan completedAt/createdAt, latest template run timestamp) for that engagement, or `createdAt` fallback.
   - Ordered by `lastActivityAt` desc so the busiest engagements surface first.
   - Implementation must avoid N+1: fetch engagements once, then batched `groupBy` for asset counts and severity counts keyed by engagementId, and a `groupBy` max timestamp for activity; stitch in memory.

Export the functions and their types from `libs/insight/src/index.ts`. Each gets a unit test under `libs/insight/src/__tests__` (or co-located `*.spec.ts` matching the repo convention) using the existing Prisma test harness.

### Backend — `apps/api-gateway/src/app/insight`

- New DTOs under `insight/dto`: `GlobalOverviewObject` (+ `EngagementsByStatusObject`), `ActivityItemObject` (with a GraphQL enum `ActivityKind`), `EngagementSummaryObject`. Reuse the existing `SeverityCountsObject`.
- `InsightService` gains `globalOverview(userId)`, `recentActivity(userId, limit)`, `engagementSummaries(userId)` — no `assertOwnership` needed (they are inherently owner-scoped by `ownerId`); they call the new lib functions.
- `InsightResolver` gains three `@Query` fields: `globalOverview`, `recentActivity(limit)`, `engagementSummaries`, guarded by `JwtAuthGuard` + `@CurrentUser()`, exactly like the existing queries.
- Resolver/service spec coverage mirroring `insight.service.spec.ts`.

### Frontend — `apps/frontend/src/features/dashboard`

New route `/dashboard`, set as the default authenticated landing (the `*` redirect and post-login redirect point to `/dashboard` instead of `/engagements`). `TopBar` gains a **Dashboard** link (first item) and keeps Engagements + Settings.

`DashboardPage` layout (top → bottom), all dark-theme Tailwind consistent with existing pages:

1. **KPI tile row** — `Engagements` (with active/total), `Assets`, `Open findings`, `Critical`, `High`, `Active schedules`, `Running scans`. Reuse a shared `Tile` (promote the one from `attack-surface-counters.tsx` into a small shared component, or duplicate the trivial pattern — keep it local to dashboard to avoid coupling).
2. **Two-column band**: global **Severity donut** (left) + **Attack surface** breakdown tiles domains/subdomains/IPs/open ports/techs (right). The donut SVG math already exists in `severity-donut.tsx`; extract the pure rendering into a `SeverityDonutChart` that takes `SeverityCounts` as a prop so both the dashboard and the engagement Overview use it (refactor `severity-donut.tsx` to consume it — no behavior change, covered by its existing test).
3. **Recent activity feed** — list of cross-engagement items: kind badge, label, engagement name (links to that engagement), status pill, relative timestamp (`format-date.ts`).
4. **Engagement summary grid** — responsive cards: name + client, status pill, asset count, a compact severity bar (critical/high/medium/low/info segments), last-activity timestamp, click → `/engagements/:id`. Empty state with a "Create your first engagement" link to `/engagements` when the operator owns none.

A single **Refresh** button (re-runs the three queries via Apollo `refetch`) in the header; no auto-polling in v1.

Each new component gets a React Testing Library spec mirroring the synthesis component tests (`MockedProvider` + query mocks, assert rendered counts/labels/empty states).

## Data flow

`DashboardPage` mounts → fires `GLOBAL_OVERVIEW_QUERY`, `RECENT_ACTIVITY_QUERY`, `ENGAGEMENT_SUMMARIES_QUERY` (three independent `useQuery`s, each component owns its query so loading/error states are local). Resolver → `InsightService` → `libs/insight` function → Prisma → Postgres, all filtered by `ownerId`. JWT guard supplies `@CurrentUser()`; an operator only ever sees their own engagements.

## Error & empty handling

- Per-widget loading and `role="alert"` error text, identical to existing synthesis widgets (a failure in the activity feed does not blank the KPIs).
- Zero engagements → KPIs show 0, donut shows the existing "No findings yet" state, grid shows the create-first empty state.
- `limit` args clamped server-side (reuse the existing `clamp` helper).

## Testing

- `libs/insight`: unit tests for the three new functions (owner scoping, multi-engagement aggregation, zero-engagement case, N+1-free stitching).
- `api-gateway`: service spec (delegation + owner scoping) and resolver wiring.
- `frontend`: component specs for `DashboardPage` and each widget (populated + empty + error), plus an app-routing test asserting `/dashboard` is the authenticated landing and the nav link renders.
- Full `nx affected` lint/typecheck/test green before done.

## Out of scope / follow-ups

- Live subscription refresh of the dashboard (could reuse `engagementUpdated`).
- Date-range / trend sparklines.
- Saved filters or per-widget configuration.
