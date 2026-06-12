# Phase 4.2 — Report Worker + Queue — Implementation Plan

> **Date:** 2026-06-12
> **Spec:** `docs/superpowers/specs/2026-06-12-phase-4-reporting-design.md` §2.2-§2.4, §8.
> **Spec précédent:** Phase 4.1 (foundations) déjà mergé.
> **Scope:** Queue `report-jobs` + payload, app `apps/report-worker` consommant la queue, processor exécutant la pipeline render → upload → status, tests.
> **Out of scope:** GraphQL surface, REST endpoint, UI — voir Phase 4.3 / 4.4.

---

## T1 — Queue + payload

- [ ] **T1.1** — Ajouter `REPORT_JOBS: 'report-jobs'` à `libs/queues/src/queue-names.ts`.
- [ ] **T1.2** — Ajouter `ReportJobPayload { reportId: string }` à `libs/queues/src/job-payloads.ts` + l'entrée dans `QueuePayloadMap`.
- [ ] **T1.3** — Vérifier `libs/queues/src/queues.module.ts` enregistre bien la nouvelle queue (ou laisser le worker le faire selon le pattern existant — inspecter cve-enrichment).

**Definition of done:** `pnpm nx test queues` passe.

---

## T2 — App scaffold

- [ ] **T2.1** — Créer `apps/report-worker/` en miroir de `apps/cve-enricher-worker/`:
  - `project.json` (executor `@nx/node:webpack`, targets `serve`/`build`/`test`/`type-check`).
  - `tsconfig.json` / `tsconfig.app.json` / `tsconfig.spec.json` / `jest.config.ts`.
  - `webpack.config.js` (copie du worker existant).
  - `src/main.ts` (bootstrap NestJS standalone context, identique à cve-enricher).
  - `src/app/app.module.ts` (imports: ConfigModule, LoggingModule, DatabaseModule, StorageModule, QueuesModule, ReportProcessor).
- [ ] **T2.2** — Ajouter l'app à `tsconfig.base.json` paths si nécessaire (en général non — les apps n'y sont pas).

**Definition of done:** `pnpm nx build report-worker` passe sans erreur.

---

## T3 — ReportProcessor

- [ ] **T3.1** — Créer `apps/report-worker/src/app/report.processor.ts`:
  - `@Processor(QueueName.REPORT_JOBS)` (depuis `@nestjs/bullmq`).
  - Méthode `@Process()` qui reçoit `Job<ReportJobPayload>`.
  - Étapes:
    1. Charger `Report` par `reportId` (avec `include: { template: true }`); si introuvable, log + throw (BullMQ retry).
    2. Update Report `status = GENERATING`, `startedAt = new Date()`.
    3. Charger le contexte: engagement (avec `assets` + `findings` filtrés via `report.filters`), `scans`, `observations` (limité à 1000 par engagement pour ne pas exploser la mémoire), `cveCache` pour les findings avec cveId.
    4. Render selon format:
       - PDF: `TemplateEngine.render(template.templateSource, ctx)` → HTML → `PuppeteerPdfRenderer.renderHtml(html)` → Buffer.
       - CSV: `CsvRenderer.render(rows, columns)` où rows = findings.
       - SARIF: `SarifBuilder.build(findings.map(toSarifInput), pkgVersion)` → JSON.stringify.
       - JSON: `JsonExporter.serialize(ctx)`.
    5. Construire `storageKey = \`${report.engagementId}/${report.id}.${ext}\`` (ext = pdf|csv|sarif.json|json).
    6. `storage.putObject({ bucket: 'reports', key: storageKey, body, contentType })` (contentType par format).
    7. Update Report: `status = READY`, `storageKey`, `sizeBytes = body.length`, `contentType`, `completedAt = new Date()`.
  - Catch global: si une étape throw → update Report `status = FAILED`, `errorMessage = err.message`, `completedAt = new Date()`, puis re-throw pour activer le retry BullMQ (jusqu'à 3 essais).
- [ ] **T3.2** — Bind du PdfRenderer via DI: provider `{ provide: PDF_RENDERER, useClass: PuppeteerPdfRenderer }`, injecté dans le processor.

**Definition of done:** Le processor compile et est enregistré dans le module.

---

## T4 — Tests processor

- [ ] **T4.1** — `apps/report-worker/src/app/__tests__/report.processor.spec.ts`:
  - Mock Prisma (`reportRepo.findUnique`/`update`, `assetRepo.findMany`, etc.).
  - Mock Storage (`putObject`).
  - Mock PdfRenderer (`renderHtml` retourne `Buffer.from('pdf-mock')`).
  - Cas 1: PDF — vérifier la séquence GENERATING → READY, le storageKey, la taille, le call à `putObject({ bucket: 'reports', ... })`.
  - Cas 2: CSV — vérifier l'extension `.csv` et le contentType `text/csv`.
  - Cas 3: SARIF — vérifier le JSON contient `version: "2.1.0"`.
  - Cas 4: JSON — vérifier serialize est appelé.
  - Cas 5: render throw → Report passe à FAILED avec errorMessage, et le throw remonte.
  - Cas 6: Report introuvable → throw immédiat.
- [ ] **T4.2** — Cas e2e gated `REPORTING_E2E=1`: lance Prisma réel + Redis + MinIO, crée un Report, déclenche le processor, vérifie le row final + l'objet MinIO. (Optionnel — peut migrer en Phase 4.4.)

**Definition of done:** `pnpm nx test report-worker` passe (cas 1-6).

---

## T5 — Module wiring + BullMQ config

- [ ] **T5.1** — Dans `apps/report-worker/src/app/app.module.ts`:
  - `BullModule.forRoot(...)` avec connexion Redis depuis `AppConfigService`.
  - `BullModule.registerQueue({ name: QueueName.REPORT_JOBS, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1_000 } } })`.
  - Provider PrismaService, StorageModule, PDF_RENDERER, ReportProcessor.
- [ ] **T5.2** — Vérifier que la concurrence est configurable via env `REPORT_WORKER_CONCURRENCY` (default 2). Documenter dans `.env.example`.

**Definition of done:** `pnpm nx serve report-worker` démarre sans crash (test manuel quand l'infra locale est dispo).

---

## T6 — Validation cross-cutting

- [ ] **T6.1** — `pnpm nx run-many --target=test --projects=reporting,queues,report-worker` vert.
- [ ] **T6.2** — `pnpm nx run-many --target=type-check --projects=report-worker,api-gateway,parser-worker,cve-enricher-worker` vert.
- [ ] **T6.3** — Commit unique: `feat(phase-4.2): add report-worker + report-jobs queue + processor`.

---

## Risques

- **Puppeteer dans l'image Docker**: la worker image doit installer `puppeteer` et son Chromium. À gérer dans la Phase 4.2 ou en suivi. Pour V1 on installe `puppeteer` comme dep racine et on documente que l'image doit faire `apt-get install chromium` ou utiliser l'image officielle `node:20-bookworm-slim` + `pnpm install` (puppeteer télécharge son binaire).
- **Mémoire**: render PDF d'un gros engagement peut être lourd. Le cap de 50 MB de la spec + le `concurrency: 2` du worker mitigent.

---

## Prochaine étape

Phase 4.3 — GraphQL surface (mutation `generateReport`, queries `reports`, `reportTemplates`, controller REST `/reports/:id/download`).
