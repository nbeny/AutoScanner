# Phase 5 — Scheduler, notifications, agents distribués, webhooks — Design

> **Date:** 2026-06-12
> **Statut:** Spec V1 — issu de la spec maître §1 (Phase 5), §4 (Prisma), §12.2 (GraphQL), §17.2 (CLI). En attente de revue avant `writing-plans`.
> **Cycle:** Brainstorming (déjà fait dans la spec maître Phase 5) → **Spec (ce document)** → Plans 5.x → Code.
> **Spec maître:** `docs/superpowers/specs/2026-05-24-autoscanner-platform-design.md`.
> **Spec précédent:** `docs/superpowers/specs/2026-06-12-phase-4-reporting-design.md` (Phase 4 — reporting, livré).

Phase 4 a livré les rapports manuels. Phase 5 ferme la boucle de l'automatisation: les scans s'auto-déclenchent (scheduler), les opérateurs sont notifiés (notification-worker), les jobs peuvent s'exécuter depuis un agent externe au serveur (agent distribué), et les outils tiers peuvent injecter leurs résultats sans interface (webhooks).

---

## 1. Objectif et critère "done"

**Objectif:** un opérateur déclare un `Schedule` "scan nightly de `client.com` avec `recon-passive`", reçoit un email/Slack à la fin de chaque run, et peut router le travail soit vers le scan-worker mutualisé soit vers un agent enrôlé sur son laptop. En parallèle, un outil externe (Burp, ZAP, ou format `generic`) peut POSTer des findings qui sont normalisées et persistées comme si elles venaient d'un scanner natif.

**Critère "done" Phase 5:**

1. Models Prisma `Schedule`, `NotificationChannel`, `Notification`, `Agent`, `WebhookEvent` + enums `AgentStatus`, `NotificationChannelType`, `DeliveryStatus` ajoutés + migration appliquée. `ScanJob.agentId` (nullable) ajouté avec relation `Agent`.
2. App `apps/scheduler` (NestJS standalone) qui hydrate les `Schedule` row activés en `repeatable` BullMQ et produit des enqueues `template-runs` à l'heure cron (avec timezone). Réagit au CRUD via Postgres `LISTEN/NOTIFY` ou polling 30s — V1 = polling 30s pour la simplicité.
3. App `apps/notification-worker` consommant queue `notification-jobs`, dispatchant par `NotificationChannelType` (EMAIL via SMTP, SLACK/DISCORD/WEBHOOK via HTTP POST), avec retries + `DeliveryStatus` PENDING → SENT/FAILED. Trigger: `scan.completed`, `scan.failed`, `finding.critical`, `report.ready`, `schedule.finished`.
4. GraphQL surface: CRUD `schedules` + `notificationChannels`, `agents`, `agentRegistrations`, `testNotificationChannel`, `revokeAgent`. Auth opérateur via JwtAuthGuard.
5. Agent distribué v1: enrôlement par token one-time (mutation `createAgentRegistration` → renvoie `bootstrapToken`), endpoint REST `POST /agents/heartbeat` (auth via signature ed25519 publique stockée à l'enrôlement), capabilities (`{os, arch, tools[], networks[]}`). Routing: si `ScanJob` est créé avec `agentId`, le scan-worker classique ignore, l'agent poll `claimScanJob` GraphQL et exécute.
6. Webhook ingest: `POST /webhooks/burp|zap|generic` (auth bearer-via-`X-Autoscanner-Token`), insertion `WebhookEvent`, enqueue `webhook-jobs`, worker (réutilise parser-worker pipeline) normalise vers `Finding`/`Asset`.
7. UI: page "Schedules" (liste + form), page "Notifications" (channels + log de delivery), page "Agents" (liste + bouton "Enrôler"). Pas d'UI dédiée pour webhooks v1 — la doc CLI suffit.
8. CLI: `autoscanner schedule create|list|delete`, `autoscanner agent register|run|list`, `autoscanner notification channel create|test` — surface décrite §17.2 du master spec.
9. CI verte; tests Jest unitaires sur scheduler/notification-worker/agent-routing, e2e gated `SCHEDULER_E2E`/`NOTIFICATIONS_E2E`/`AGENT_E2E`.

**Non-buts (out of scope v1):**

- Édition UI des `Schedule` cron par drag-and-drop (V2).
- Templates Handlebars dans le corps des notifications. V1 = messages statiques avec variables fixes (`{{engagementName}}`, `{{scanId}}`, `{{severity}}`).
- Agent push: V1 = l'agent **pull** ses jobs via GraphQL long-poll (ou WS subscription si déjà branché). Pas de tunnel TLS sortant ad-hoc.
- Plugin marketplace pour webhook sources tiers — V1 = trois sources hardcodées (`burp`, `zap`, `generic`).
- 2FA/TOTP sur l'enrôlement d'agent — V1 = single-use token, valide 24h, lié à un user.
- `notification.batch` / digest quotidien — V1 = 1 event ⇒ 1 notification.

---

## 2. Découpage en sous-phases

| # | Titre | Livrable principal | Critère "done" |
|---|---|---|---|
| **5.1** | Scheduler foundations | `Schedule` model + `apps/scheduler` + repeatable BullMQ | `Schedule` activé enqueue un `templateRun` à l'heure cron sur stack locale; tests unitaires hydration + cron→queue. |
| **5.2** | Scheduler GraphQL + UI | Resolver `Mutation/Query schedules`, page `/schedules` | UI: créer un schedule sur un engagement, voir `nextRunAt`, désactiver. |
| **5.3** | Notifications foundations + worker | Models + `apps/notification-worker` + adapters EMAIL/SLACK/DISCORD/WEBHOOK | `scan.completed` → notification reçue dans channel test (mock SMTP / mock HTTP). UI channels CRUD. |
| **5.4** | Agent distribué v1 | `Agent` model + enrôlement + heartbeat + routing `ScanJob.agentId` | Enrôler un agent localement, lui faire claim/run un scan-job nmap, voir le résultat persister. |
| **5.5** | Webhook ingest | `WebhookEvent` + endpoints + worker normalisation | `POST /webhooks/generic` avec findings ZAP-shaped → Findings DB. |

Chacune produit son propre plan `docs/superpowers/plans/2026-06-XX-phase-5-X-...md` avant l'écriture de code.

---

## 3. Architecture transverse

### 3.1 Modèle de données

**Nouveaux enums + tables** (à ajouter dans `prisma/schema.prisma` après le bloc `Report`):

```prisma
// =====================================================================
// SCHEDULER (Phase 5.1)
// =====================================================================
model Schedule {
  id             String       @id @default(cuid())
  engagementId   String
  templateId     String
  name           String                                  // "nightly recon"
  cronExpr       String                                  // "0 2 * * *"
  timezone       String       @default("UTC")
  targets        String[]                                // targets passés au templateRun
  config         Json?                                   // options runtime forwardées au template
  enabled        Boolean      @default(true)
  lastRunAt      DateTime?
  nextRunAt      DateTime?
  lastTemplateRunId String?
  createdById    String
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  deletedAt      DateTime?

  engagement     Engagement   @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  template       ScanTemplate @relation(fields: [templateId], references: [id])
  createdBy      User         @relation(fields: [createdById], references: [id])

  @@index([engagementId])
  @@index([enabled, nextRunAt])
  @@index([deletedAt])
}

// =====================================================================
// NOTIFICATIONS (Phase 5.3)
// =====================================================================
enum NotificationChannelType { EMAIL SLACK DISCORD WEBHOOK }
enum DeliveryStatus { PENDING SENT FAILED }

model NotificationChannel {
  id              String  @id @default(cuid())
  userId          String
  name            String
  type            NotificationChannelType
  configEncrypted Bytes                       // AES-GCM (target, token, secret)
  enabled         Boolean @default(true)
  eventFilters    String[]                    // ["scan.completed","finding.critical"]
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
  eventType      String                      // "scan.completed" | …
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

// =====================================================================
// AGENTS (Phase 5.4)
// =====================================================================
enum AgentStatus { PENDING ACTIVE IDLE OFFLINE REVOKED }

model Agent {
  id                String      @id @default(cuid())
  name              String      @unique
  hostname          String?
  publicKey         String?                          // ed25519 base64 (signature heartbeat)
  registrationToken String?     @unique              // one-time, nullable after enroll
  enrolledAt        DateTime?
  status            AgentStatus @default(PENDING)
  capabilities      Json?                            // {os, arch, tools:[], networks:[]}
  version           String?
  lastHeartbeatAt   DateTime?
  ipAddress         String?
  metadata          Json?
  createdById       String
  revokedAt         DateTime?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  jobs              ScanJob[]
  createdBy         User        @relation(fields: [createdById], references: [id])

  @@index([status])
  @@index([lastHeartbeatAt])
}

// =====================================================================
// WEBHOOK INGEST (Phase 5.5)
// =====================================================================
model WebhookEvent {
  id              String   @id @default(cuid())
  source          String                              // "burp" | "zap" | "generic"
  payload         Json
  receivedFromIp  String?
  receivedAt      DateTime @default(now())
  processedAt     DateTime?
  resultingScanId String?
  errorMessage    String?

  @@index([source])
  @@index([processedAt])
}
```

**Deltas existants:**

- `User`: ajouter `schedules Schedule[]`, `notificationChannels NotificationChannel[]`, `agentsCreated Agent[]`.
- `Engagement`: ajouter `schedules Schedule[]`.
- `ScanTemplate`: ajouter `schedules Schedule[]`.
- `ScanJob`: ajouter `agentId String?` + `agent Agent? @relation(fields:[agentId], references:[id], onDelete:SetNull)` + `@@index([agentId])`.
- `Scan`: pas de changement.

### 3.2 Queues BullMQ

`libs/queues/src/queue-names.ts`:

```ts
export const QueueName = {
  SCAN_JOBS:       'scan-jobs',
  PARSE_JOBS:      'parse-jobs',
  TEMPLATE_RUNS:   'template-runs',
  CVE_ENRICHMENT:  'cve-enrichment',
  REPORT_JOBS:     'report-jobs',
  NOTIFICATION_JOBS: 'notification-jobs',     // NEW
  WEBHOOK_JOBS:    'webhook-jobs',            // NEW
  // Pas de queue dédiée au scheduler: il utilise BullMQ "repeatable" jobs directement sur TEMPLATE_RUNS.
} as const;
```

Payload `notification-jobs`:

```ts
export interface NotificationJobPayload {
  notificationId: string;   // resolve channel+payload depuis Prisma
}
```

Payload `webhook-jobs`:

```ts
export interface WebhookJobPayload {
  webhookEventId: string;
}
```

### 3.3 Composants

```
┌──────────────────────────┐      ┌───────────────────────┐
│ apps/scheduler           │──▶── │ queue: template-runs  │ (repeatable)
│  (NestJS standalone,     │      └───────────────────────┘
│   poll Schedule 30s)     │              │
└──────────────────────────┘              ▼
                                  orchestrator-worker (existant)

┌──────────────────────────┐      ┌──────────────────────────┐
│ event-bus (existant      │──▶── │ queue: notification-jobs │
│   via engagement-events  │      └──────────────────────────┘
│   + nouveaux producers)  │              │
└──────────────────────────┘              ▼
                                  apps/notification-worker
                                  ├─ EmailAdapter (nodemailer)
                                  ├─ SlackAdapter (webhook URL)
                                  ├─ DiscordAdapter (webhook URL)
                                  └─ GenericWebhookAdapter

┌──────────────────────────┐      ┌──────────────────────────┐
│ apps/api-gateway         │      │ apps/api-gateway         │
│  GraphQL Agent surface   │      │  REST /agents/heartbeat  │
│  + claimScanJob long-poll│      │  REST /agents/jobs/:id/* │
└──────────────────────────┘      └──────────────────────────┘
            ▲                                  ▲
            │ pull/long-poll                   │ POST signed heartbeat
            │                                  │
┌──────────────────────────┐
│ apps/cli (autoscanner    │
│   agent run)             │
└──────────────────────────┘

┌──────────────────────────┐      ┌──────────────────────────┐
│ apps/api-gateway         │──▶── │ queue: webhook-jobs      │
│  REST /webhooks/:source  │      └──────────────────────────┘
│  → insert WebhookEvent   │              │
└──────────────────────────┘              ▼
                                  parser-worker (extension):
                                  webhook adapters
                                  (burp/zap/generic) ⟶ Finding/Asset
```

### 3.4 Event sourcing pour notifications

Notifications utilisent l'event-bus existant (`@autoscanner/engagement-events`). On ajoute des **publishers**:

- `scan.completed` / `scan.failed` — émis par `scan-worker` quand un `Scan` passe à un terminal.
- `report.ready` — émis par `report-worker` au moment du `Report.status = READY`.
- `schedule.finished` — émis par scheduler après confirmation du `templateRun` terminal.
- `finding.critical` — émis par parser-worker quand une `Finding` CRITICAL est créée.

Côté `notification-worker`, un `EventBusListener` fan-out: pour chaque `NotificationChannel` actif dont `eventFilters` matche l'event, insère un `Notification` PENDING + enqueue.

---

## 4. Sécurité & boundaries

- **Schedules**: cron expression validé via `cron-parser` au moment du create/update (rejet si invalide). Pas d'exécution shell — uniquement enqueue.
- **Notifications**: `configEncrypted` chiffré AES-GCM avec clé `NOTIFICATIONS_ENCRYPTION_KEY` (env, 256-bit). Jamais retournée par GraphQL en clair, le resolver expose seulement `type`, `name`, `enabled`, `eventFilters`.
- **Agents**: `publicKey` ed25519 stocké à l'enrôlement. Chaque heartbeat envoie `{agentId, ts, capabilities}` + signature ed25519 du body. `registrationToken` single-use, expire 24h, hashé en base (jamais retourné après enrôlement).
- **Webhooks**: chaque source a un secret `WEBHOOK_<SOURCE>_TOKEN` (env). Le serveur compare en constant-time. Rate-limit 30 req/min/IP via `@nestjs/throttler` (déjà branché en config).
- **Audit logs**: chaque mutation (`createSchedule`, `createAgentRegistration`, `revokeAgent`, `createNotificationChannel`) écrit un `AuditLog` (existant).

---

## 5. Validation & critères acceptance par sous-phase

### 5.1 Scheduler foundations
- `pnpm nx test scheduler database` vert.
- Stack locale: créer une `Schedule` cron `*/1 * * * *`, observer un `TemplateRun` inséré dans la minute suivante.
- `pnpm dev:up` lance le scheduler à côté des autres workers.

### 5.2 Scheduler GraphQL + UI
- Vitest frontend: page `Schedules` rend une liste, le form crée un schedule via mutation.
- E2E gated `SCHEDULER_E2E=1`: créer un schedule, attendre un templateRun, supprimer.

### 5.3 Notifications
- Test unitaire `NotificationDispatcher`: pour event `scan.completed` + channel SLACK actif, exécute POST sur l'URL configurée.
- E2E `NOTIFICATIONS_E2E=1` avec un Slack webhook capture (mailpit pour EMAIL, http capture pour SLACK).

### 5.4 Agents
- Test unitaire: `claimScanJob({capabilities:{tools:['nmap']}})` retourne un job nmap pending et `agentId` est setté.
- E2E `AGENT_E2E=1`: enrôler agent, démarrer `autoscanner agent run`, lancer scan nmap routé sur l'agent.

### 5.5 Webhooks
- Test unitaire `GenericWebhookAdapter`: payload JSON shaped `{findings:[{title,severity,assetValue}]}` produit findings normalisées.
- E2E `WEBHOOK_E2E=1`: POST /webhooks/generic, vérifier 1 finding visible dans GraphQL `findings(engagementId)`.

---

## 6. Hors scope (revisité explicitement)

- Schedules avec dépendances (run B si A succès). V2.
- Notifications digest (batch quotidien). V2.
- Agents Windows compilés via `pkg`/`bun build --compile` — la CLI Node packagée est livrée Phase 5.4 mais la cross-compile statique est V2.
- Webhook sources additionnels (Nessus, OpenVAS, AWS Inspector). V2.
- UI "Webhook activity" feed. V2.

---

## 7. Risques

| # | Risque | Mitigation V1 |
|---|---|---|
| R1 | BullMQ repeatable + drift de timezone Postgres | Toutes les `Schedule.timezone` interpolées dans `cron-parser`, jamais sur `Date.now()` Node naked. Test unitaire avec timezones non-UTC. |
| R2 | Notification spam si `eventFilters=[]` | Default seed = filtres explicites; UI form impose au moins 1 filtre. |
| R3 | Agent claim un job puis crash sans heartbeat | Heartbeat TTL 90s, sweeper reset les jobs `RUNNING` orphelins → PENDING (déjà existant pour scan-worker, étendu à l'agentId). |
| R4 | Webhook payload malicieux (XXE, ZIP bomb) | JSON-only ingest, taille max 5MB, rejet sans parse au-delà. |
| R5 | Clé de chiffrement perdue → channels illisibles | Documentation: la clé doit être backup-é à côté des dumps Postgres. V2 = key rotation. |

---

## 8. Plans à venir

- `docs/superpowers/plans/2026-06-12-phase-5-1-scheduler-foundations.md` — premier livrable.
- `docs/superpowers/plans/2026-06-1X-phase-5-2-...md`
- etc.

Chaque plan suit le format Phase 4 (Contexte → Architecture → Sous-tâches T1..Tn → Validation → Hors scope).
