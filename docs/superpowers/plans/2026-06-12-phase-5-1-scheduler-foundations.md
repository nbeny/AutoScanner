# Phase 5.1 — Scheduler Foundations — Implementation Plan

> **Date:** 2026-06-12
> **Spec:** `docs/superpowers/specs/2026-06-12-phase-5-scheduler-notifications-agents-design.md` §2 (5.1) + §3.
> **Scope:** Migration Prisma `Schedule`, app `apps/scheduler` (NestJS standalone), `ScheduleHydrator` qui hydrate les rows actifs en jobs BullMQ `template-runs` au moment du cron, recompute de `nextRunAt`/`lastRunAt`. Pas de GraphQL / pas d'UI.
> **Out of scope:** GraphQL CRUD `schedules` + page UI (Phase 5.2). Notifications (5.3). Agents (5.4). Webhooks (5.5).

---

## Pré-requis

- Master spec §1 (Phase 5), §4 (modèle Prisma Schedule), §6.1 (queues BullMQ).
- Spec Phase 5 §2.1, §3.1, §3.2.
- Stack actuelle: `orchestrator-worker` consomme `template-runs`; `api-gateway` produit `template-runs` via `TemplatesService.runTemplate`.
- BullMQ supporte `add()` régulier — pas de `repeatable` côté Bull. Décision design: scheduler **polle Postgres** toutes les 30s, calcule `due` via `cron-parser`, et fait `add()` direct. Évite la divergence "repeatable Redis vs Schedule Postgres" qui devient ingérable au moindre redeploy.

---

## T1 — Prisma migration: Schedule

- [ ] **T1.1** — Ajouter à `prisma/schema.prisma` après le bloc `ReportTemplate`/`Report`:

```prisma
// =====================================================================
// SCHEDULER (Phase 5.1)
// =====================================================================
model Schedule {
  id                String       @id @default(cuid())
  engagementId      String
  templateId        String
  name              String
  cronExpr          String       // "0 2 * * *"
  timezone          String       @default("UTC")
  targets           String[]     // forwarded as one templateRun per target
  config            Json?
  enabled           Boolean      @default(true)
  lastRunAt         DateTime?
  nextRunAt         DateTime?
  lastTemplateRunId String?
  createdById       String
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt
  deletedAt         DateTime?

  engagement        Engagement   @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  template          ScanTemplate @relation(fields: [templateId], references: [id])
  createdBy         User         @relation(fields: [createdById], references: [id])

  @@index([engagementId])
  @@index([enabled, nextRunAt])
  @@index([deletedAt])
}
```

- [ ] **T1.2** — Ajouter aux models existants:
  - `User`: `schedules Schedule[]`
  - `Engagement`: `schedules Schedule[]`
  - `ScanTemplate`: `schedules Schedule[]`

- [ ] **T1.3** — Générer la migration:
  ```
  pnpm prisma migrate dev --name add_schedule_model
  ```
  (En env de dev local, fallback `--create-only` si pas de DB up — le smoke `database:test` est OK sans Postgres mais migrate dev nécessite Postgres.)

- [ ] **T1.4** — Regénérer le client: `pnpm prisma generate`.

---

## T2 — Lib `@autoscanner/queues`: pas de queue, juste types partagés

Le scheduler ne crée pas de nouvelle queue — il enqueue sur `TEMPLATE_RUNS` (réutilise `TemplateRunPayload` existant). Mais on ajoute un champ optionnel pour distinguer "vient d'un schedule" dans les logs/notifications futures.

- [ ] **T2.1** — Vérifier `libs/queues/src/job-payloads.ts`: `TemplateRunPayload` a déjà `{ templateRunId, engagementId }`. **Pas de change** — la trace de la `Schedule` est sur `TemplateRun.metadata.scheduleId` (champ Json existant via `ScanTemplate.config` non. Vérifier: `TemplateRun` actuel n'a pas de `metadata Json` field. Si pas présent: ajouter `scheduleId String?` à `TemplateRun` model dans T1.) Décision: **ajouter `scheduleId String?` + index `@@index([scheduleId])` à `TemplateRun`** dans T1.1 sans relation FK (pas critique, garder soft pour découplage scheduler/orchestrator).

- [ ] **T2.2** — Mettre à jour T1.1 (ci-dessus) pour ajouter `scheduleId String?` sur `TemplateRun`. **Action concrète:** patcher `prisma/schema.prisma` model `TemplateRun` + index.

---

## T3 — App `apps/scheduler` — squelette NestJS standalone

- [ ] **T3.1** — Créer la structure:
  ```
  apps/scheduler/
    project.json           (mirror apps/orchestrator-worker/project.json: build/serve/test targets)
    webpack.config.js      (copy minimal)
    tsconfig.json
    tsconfig.app.json
    tsconfig.spec.json
    jest.config.ts
    src/
      main.ts              (NestFactory.createApplicationContext + Logger + shutdown hooks)
      app/
        app.module.ts      (PrismaModule, BullModule.registerQueue TEMPLATE_RUNS, AppConfigModule, AppLoggingModule, ScheduleHydrator)
        schedule-hydrator.service.ts
        __tests__/
          schedule-hydrator.spec.ts
  ```

- [ ] **T3.2** — `main.ts`: démarre l'app, log `scheduler started`, expose un `INTERVAL` (cf T4). Code copié de `orchestrator-worker/src/main.ts` adapté:
  ```ts
  // … standard bootstrap …
  const hydrator = app.get(ScheduleHydrator);
  await hydrator.start();
  ```

- [ ] **T3.3** — `app.module.ts`: imports comme orchestrator (AppConfigModule, AppLoggingModule, PrismaModule, QueuesModule, BullModule.registerQueue TEMPLATE_RUNS).

- [ ] **T3.4** — Mettre à jour `package.json` ou `pnpm-workspace.yaml` si nécessaire (les workspaces sont déjà glob `apps/*`).

- [ ] **T3.5** — Ajouter `scheduler` à la commande `pnpm dev:up` (script `package.json` dans `apps/` ou root) afin qu'un `pnpm dev:up` lance le scheduler à côté du reste.

---

## T4 — `ScheduleHydrator` (cœur métier)

Service `@Injectable()` qui:

1. À `start()`, lance un `setInterval(poll, POLL_INTERVAL_MS)` (default 30s).
2. À chaque `poll()`:
   - Charge tous les `Schedule` où `enabled=true && deletedAt=null && (nextRunAt is null || nextRunAt <= now())`.
   - Pour chacun:
     - Calcule `nextDue` via `cron-parser.CronExpressionParser.parse(cron, { tz: schedule.timezone })`.
     - Si `nextRunAt is null` (1ʳᵉ initialisation): set `nextRunAt = nextDue` et **ne pas** enqueue (pas encore due — l'utilisateur vient de créer le schedule).
     - Sinon (`nextRunAt <= now`):
       - Pour chaque `target` de `schedule.targets`:
         - Crée un `TemplateRun (status=PENDING, scheduleId=schedule.id, ...)`.
         - Enqueue sur `template-runs` (`{ templateRunId, engagementId }`).
       - Update `Schedule.lastRunAt = now()`, `lastTemplateRunId = lastRun.id` (premier des N targets), `nextRunAt = nextDue` (calculé à partir de `now()`).
   - Log INFO `hydrated N schedules (M templateRuns enqueued)`.

- [ ] **T4.1** — Ajouter dépendance `cron-parser` dans `package.json` root.

- [ ] **T4.2** — Implémenter `ScheduleHydrator`:
  ```ts
  @Injectable()
  export class ScheduleHydrator implements OnModuleDestroy {
    private timer: NodeJS.Timeout | null = null;
    constructor(
      private readonly prisma: PrismaService,
      @InjectQueue(QueueName.TEMPLATE_RUNS) private readonly queue: Queue<TemplateRunPayload>,
      private readonly cfg: AppConfigService,
    ) {}

    async start(): Promise<void> { /* poll immédiat puis setInterval */ }
    async pollOnce(): Promise<{ scanned: number; enqueued: number }> { /* logique au-dessus */ }
    onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  }
  ```

- [ ] **T4.3** — **Idempotence**: si `pollOnce()` crash en plein milieu (DB down après le 3ᵉ create sur 5), au prochain tick on aura `nextRunAt` encore au passé pour ces schedules → re-trigger. **Solution v1:** prendre un lock applicatif via `SELECT … FOR UPDATE SKIP LOCKED` n'est pas dispo facilement Prisma. À la place: utiliser `prisma.$transaction` autour de `[ for each target: create TemplateRun, then update Schedule.nextRunAt at the end ]`. Si le batch crash → la transaction rollback, on retentera sans doublons. Risque accepté: si on a déjà fait `queue.add()` et que la transaction rollback ensuite → orphan job orchestrator-side. Mitigation: `queue.add()` happens **après** la transaction commit.

  Pseudocode:
  ```ts
  const result = await this.prisma.$transaction(async (tx) => {
    const createdRuns = [];
    for (const target of schedule.targets) {
      const run = await tx.templateRun.create({ data: { ..., scheduleId: schedule.id } });
      createdRuns.push(run);
    }
    await tx.schedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: now,
        lastTemplateRunId: createdRuns[createdRuns.length - 1]?.id ?? null,
        nextRunAt: nextDue,
      },
    });
    return createdRuns;
  });
  // Post-commit: enqueue side-effects. If this throws, the TemplateRun row
  // is still PENDING and the reconcile path in orchestrator-worker picks
  // it up at next boot — same crash recovery as TemplatesService.
  for (const run of result) {
    await this.queue.add('template-run', { templateRunId: run.id, engagementId: schedule.engagementId });
  }
  ```

- [ ] **T4.4** — Pas de timer de cleanup pour le `setInterval` au-delà de `onModuleDestroy()` — `NestFactory.createApplicationContext` + `enableShutdownHooks()` couvre SIGTERM.

---

## T5 — Tests unitaires

`apps/scheduler/src/app/__tests__/schedule-hydrator.spec.ts`:

- [ ] **T5.1** — Mock `PrismaService` + mock `Queue` (Jest `jest.fn()`).
- [ ] **T5.2** — Cas couverts:
  1. **First hydration (`nextRunAt is null`)**: set `nextRunAt` to next cron tick, **ne pas** enqueue, ne pas update `lastRunAt`.
  2. **Due schedule (`nextRunAt <= now`)**: crée 1 `TemplateRun` par target, enqueue, update `lastRunAt`+`nextRunAt`.
  3. **Multiple targets**: 3 targets → 3 TemplateRun + 3 enqueues + 1 update Schedule.
  4. **Disabled schedule**: ignoré par le query (la query a `enabled=true`).
  5. **Deleted schedule**: ignoré (`deletedAt: null` clause).
  6. **Crash entre create et queue.add()**: si `queue.add()` throw, le TemplateRun row existe encore PENDING (test: queue mock throws, vérifier `templateRun.create` n'est PAS rollback car post-transaction).
  7. **Timezone Europe/Paris à 02:00**: cron `0 2 * * *` calcule un `nextDue` correctement quand `now=2026-06-12T01:00:00+02:00`. Couvre R1 de la spec.

- [ ] **T5.3** — Pas de test e2e dans 5.1 — ce sera couvert dans 5.2 quand on aura la GraphQL surface pour créer un schedule.

---

## T6 — `pnpm dev:up` intégration

- [ ] **T6.1** — Inspecter `package.json` root: trouver la commande `dev:up` (vraisemblablement un `concurrently` ou `nx run-many --target=serve`).
- [ ] **T6.2** — Ajouter `scheduler` à la liste des projets serve. Cible: `pnpm nx run scheduler:serve` doit fonctionner standalone.

---

## T7 — Validation

- [ ] **T7.1** — `pnpm prisma generate` (déjà à T1.4).
- [ ] **T7.2** — `pnpm nx run-many -t lint,type-check,test -p scheduler,database` (vert).
- [ ] **T7.3** — `pnpm nx test scheduler --watch=false` (tests T5 verts).
- [ ] **T7.4** — Smoke local (manuel, gated derrière `pnpm dev:up`):
  - Stack up.
  - `INSERT INTO "Schedule" (...)` via `prisma studio` ou query SQL avec `cronExpr='*/2 * * * *'`, target valide, template existant.
  - Attendre ~2 min, observer un `TemplateRun` créé + `Schedule.lastRunAt` mis à jour + le `templateRun` consommé par orchestrator → `COMPLETED` ou `FAILED`.

- [ ] **T7.5** — Commit:
  ```
  feat(phase-5.1): scheduler app + Schedule model + cron-driven templateRun enqueue
  ```

---

## Hors scope (revisité)

- GraphQL `Mutation createSchedule` etc. → Phase 5.2.
- UI page `/schedules` → Phase 5.2.
- Notifications de fin de scheduled run → Phase 5.3 (event `schedule.finished`).
- Le scheduler ne sait pas annuler un `TemplateRun` déjà en vol (overlap si cron très court): V1 accepte les overlaps, V2 ajoutera `Schedule.preventOverlap Boolean`.
- Pas de retry policy custom — c'est le runner orchestrator qui gère les retries du `TemplateRun`.
