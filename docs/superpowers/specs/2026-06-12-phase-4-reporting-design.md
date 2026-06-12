# Phase 4 — Reporting — Design

> **Date:** 2026-06-12
> **Statut:** Spec V1 — issu de la spec maître §16, en attente de revue avant `writing-plans`.
> **Cycle:** Brainstorming (déjà fait dans la spec maître §16) → **Spec (ce document)** → Plan d'implémentation → Code.
> **Spec maître:** `docs/superpowers/specs/2026-05-24-autoscanner-platform-design.md` §16.
> **Spec précédent:** `docs/superpowers/specs/2026-05-31-phase-3-correlation-dashboard-design.md` (Phase 3 — correlation dashboard, livré).

Phase 3 a transformé la donnée corrélée en surface lisible (synthèse engagement, asset detail, riskScore, observations, CVE). Phase 4 transforme cette même donnée en livrables téléchargeables: PDF exécutif, PDF technique, CSV findings, SARIF, JSON. C'est la couche qui permet à un opérateur de produire un rapport client en un clic, et à un workflow CI de récupérer un export SARIF pour gating.

---

## 1. Objectif et critère "done"

**Objectif:** depuis la synthèse d'un engagement, un opérateur clique "Générer rapport", choisit un template (executive-summary-pdf par défaut), et reçoit en quelques secondes un fichier PDF/CSV/SARIF/JSON téléchargeable. Le rendu est asynchrone (BullMQ), reproductible (templates Handlebars seedés), traçable (table `Report` avec status PENDING → GENERATING → READY/FAILED), et accessible via URL signée MinIO (TTL 1h) ou via endpoint REST streaming.

**Critère "done" Phase 4:**

1. Modèles Prisma `Report` + `ReportTemplate` + enums `ReportFormat` (PDF/CSV/SARIF/JSON) et `ReportStatus` (PENDING/GENERATING/READY/FAILED) ajoutés + migration appliquée.
2. Lib `@autoscanner/reporting` exposant `TemplateEngine` (Handlebars + helpers), `PdfRenderer` (Puppeteer A4), `CsvRenderer` (csv-stringify), `SarifBuilder` (SARIF 2.1.0), `JsonExporter`.
3. App `report-worker` consommant la queue `report-jobs`: charge données via Prisma, render via la lib, upload sur MinIO bucket `reports`, met à jour le `Report` row.
4. GraphQL surface dans `api-gateway`: `Mutation generateReport(input: GenerateReportInput!): Report!`, `Query reports(engagementId: ID!): [Report!]!`, `Query reportTemplates: [ReportTemplate!]!`.
5. 5 templates par défaut seedés via `prisma/seed.ts` (déjà présent — voir §4.2): `executive-summary-pdf`, `technical-detailed-pdf`, `findings-csv`, `sarif-export`, `json-full-export`.
6. REST endpoint `GET /reports/:id/download` qui stream le contenu MinIO (auth via cookie session ou bearer) — utile pour la CLI et pour le CI/CD.
7. UI: bouton "Générer rapport" sur la synthèse engagement, sélecteur de template + format, panneau "Rapports récents" listant les `Report` rows avec status et lien de téléchargement.
8. CI verte; tests Jest pour la lib reporting (rendu déterministe par snapshot HTML + tailles CSV/JSON), tests Jest pour le worker (mock storage + mock Prisma), test Vitest pour le composant React, e2e env-gated `reporting-e2e` qui produit un PDF réel.

**Non-buts (out of scope v1):**

- Templates personnalisés par utilisateur (upload de `.hbs`). V1 = seulement les 5 seedés.
- Génération de rapports différentiels (diff entre deux scans). Reste un cycle entier.
- Distribution automatique par email/Slack/webhook. L'opérateur télécharge manuellement.
- Signature PDF / watermark client.
- Édition WYSIWYG du template.
- Internationalisation. V1 = FR pour les PDF, EN pour SARIF (spec impose EN), neutre pour CSV/JSON.

---

## 2. Architecture

### 2.1 Modèle de données

**Nouveaux enums + nouvelles tables** (à ajouter dans `prisma/schema.prisma` après le bloc `CveCache`):

```prisma
enum ReportFormat {
  PDF
  CSV
  SARIF
  JSON
}

enum ReportStatus {
  PENDING
  GENERATING
  READY
  FAILED
}

model ReportTemplate {
  id              String       @id @default(cuid())
  slug            String       @unique          // "executive-summary-pdf"
  name            String                        // "Executive summary (PDF)"
  description     String?
  format          ReportFormat
  templateSource  String       @db.Text         // Handlebars source (vide pour SARIF/JSON qui sont code-driven)
  isDefault       Boolean      @default(true)   // true = template seedé, non éditable
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  reports         Report[]
}

model Report {
  id              String        @id @default(cuid())
  engagementId    String
  scanId          String?                       // optionnel: rapport sur un scan unique
  templateId      String
  format          ReportFormat
  status          ReportStatus  @default(PENDING)
  filters         Json?                         // { severityMin?, kind?, ... } passé au render
  storageKey      String?                       // rempli quand status=READY
  sizeBytes       Int?
  contentType     String?                       // "application/pdf", "text/csv", ...
  errorMessage    String?
  createdById     String                        // user.id (à terme: créateur du job)
  createdAt       DateTime      @default(now())
  startedAt       DateTime?
  completedAt     DateTime?

  engagement      Engagement      @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  scan            Scan?           @relation(fields: [scanId], references: [id], onDelete: SetNull)
  template        ReportTemplate  @relation(fields: [templateId], references: [id])
  createdBy       User            @relation(fields: [createdById], references: [id])

  @@index([engagementId, createdAt(sort: Desc)])
  @@index([status])
  @@index([createdById])
}
```

Côté `User`, `Engagement`, `Scan`, ajouter la relation inverse `reports Report[]`.

### 2.2 Pipeline

```
UI / CLI
  └── GraphQL Mutation generateReport(engagementId, templateId, format?, filters?)
        ├── Validation (engagement existe, template existe, format compatible avec template)
        ├── INSERT Report (status=PENDING)
        └── enqueue { reportId } sur queue "report-jobs"

report-worker (BullMQ)
  └── on reportJob {reportId}:
        1. Update Report status=GENERATING, startedAt=now()
        2. Charger Report + ReportTemplate + données métier:
             - Engagement
             - Scans[] récents
             - Assets[] (avec riskScore, kinds, observations summary)
             - Findings[] (filtrées via Report.filters)
             - CVE summaries pour findings avec cveId
        3. Render via @autoscanner/reporting:
             - format=PDF      → TemplateEngine.render(template.source, ctx) → PdfRenderer.renderHtml(html)
             - format=CSV      → CsvRenderer.render(rows)
             - format=SARIF    → SarifBuilder.build(findings) — pas de template Handlebars
             - format=JSON     → JsonExporter.serialize(ctx) — dump structuré
        4. storage.putObject({ bucket: 'reports', key: `${engagementId}/${reportId}.${ext}`, body, contentType })
        5. Update Report: status=READY, storageKey, sizeBytes, contentType, completedAt=now()
        6. (Phase 4.5+) Publish engagementUpdated pour refresh UI temps réel

Erreurs:
  - Exception render/storage → Update Report status=FAILED, errorMessage=err.message, completedAt=now().
  - 3 retries BullMQ avec backoff exponentiel (1s, 5s, 30s). Au-delà = FAILED définitif.
```

### 2.3 Composants

```
┌────────────────────────┐
│  apps/frontend         │  React UI: "Générer rapport" + panneau Rapports
└──────────┬─────────────┘
           │ GraphQL Mutation/Query/Subscription
┌──────────▼─────────────┐
│  apps/api-gateway      │  Resolver ReportResolver + REST controller /reports/:id/download
└──────────┬─────────────┘
           │ Prisma INSERT + BullMQ add('report-jobs', { reportId })
┌──────────▼─────────────┐
│  apps/report-worker    │  NestJS standalone, ReportProcessor (Bull) consumant report-jobs
└──────────┬─────────────┘
           │ @autoscanner/reporting + @autoscanner/storage + Prisma
┌──────────▼─────────────┐
│  libs/reporting        │  TemplateEngine, PdfRenderer (Puppeteer), CsvRenderer, SarifBuilder, JsonExporter
└────────────────────────┘
```

### 2.4 Queue + payload

`libs/queues/src/queue-names.ts`:

```ts
export const QueueName = {
  SCAN_JOBS: 'scan-jobs',
  PARSE_JOBS: 'parse-jobs',
  TEMPLATE_RUNS: 'template-runs',
  CVE_ENRICHMENT: 'cve-enrichment',
  REPORT_JOBS: 'report-jobs',
} as const;
```

`libs/queues/src/job-payloads.ts`:

```ts
export interface ReportJobPayload {
  reportId: string;
}
```

---

## 3. Surface GraphQL

```graphql
enum ReportFormat { PDF CSV SARIF JSON }
enum ReportStatus { PENDING GENERATING READY FAILED }

type ReportTemplate {
  id: ID!
  slug: String!
  name: String!
  description: String
  format: ReportFormat!
  isDefault: Boolean!
}

type Report {
  id: ID!
  engagementId: ID!
  scanId: ID
  template: ReportTemplate!
  format: ReportFormat!
  status: ReportStatus!
  filters: JSON
  sizeBytes: Int
  contentType: String
  errorMessage: String
  createdAt: DateTime!
  startedAt: DateTime
  completedAt: DateTime
  downloadUrl: String         # URL signée MinIO (TTL 1h) — null tant que status != READY
}

input ReportFiltersInput {
  severityMin: Severity
  kinds: [AssetType!]
  riskScoreMin: Float
}

input GenerateReportInput {
  engagementId: ID!
  scanId: ID
  templateSlug: String!       # ex: "executive-summary-pdf"
  filters: ReportFiltersInput
}

extend type Mutation {
  generateReport(input: GenerateReportInput!): Report!
}

extend type Query {
  reports(engagementId: ID!): [Report!]!
  report(id: ID!): Report
  reportTemplates: [ReportTemplate!]!
}
```

`downloadUrl` est résolu côté resolver via `storage.presignGetUrl({ bucket: 'reports', key: report.storageKey, expiresInSeconds: 3600 })`. Le format de la mutation accepte `templateSlug` (humain) plutôt que `templateId` (cuid) pour rester stable face aux ré-exécutions de seed.

---

## 4. Templates

### 4.1 Helpers Handlebars

Lib `@autoscanner/reporting/TemplateEngine` enregistre:

- `severityBadge(severity)` → HTML span coloré (red/orange/yellow/blue/grey).
- `cvss(score)` → `"7.5 (HIGH)"`.
- `formatDate(date)` → `"2026-06-12 14:30:00 UTC"`.
- `truncate(text, n)` → tronque + `…`.
- `riskBucket(score)` → `"CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFO"`.
- `count(arr)`, `eq`, `gt`, `lt` (helpers logiques basiques).

### 4.2 Les 5 templates seedés

`prisma/seed.ts` est déjà présent dans le repo et seede les `ScanTemplate`s. On y ajoute un upsert pour chacun des 5 templates de rapport. Les sources Handlebars vivent dans `libs/reporting/src/templates/` (fichiers `.hbs`) et sont chargées via `fs.readFileSync` au moment du seed.

- **`executive-summary-pdf`** (format=PDF): 1-2 pages, en-tête client + engagement, scorecard (riskScore moyen, top 3 critiques), donut sévérité, top 10 findings, recommandations textuelles.
- **`technical-detailed-pdf`** (format=PDF): groupé par asset (riskScore desc), pour chaque asset: ports/services, technologies, findings (avec evidence, CVSS, recommandation), CVE summaries.
- **`findings-csv`** (format=CSV): une ligne par finding, colonnes: id, engagement, scanJob, assetCanonicalValue, severity, cveId, cvssV3Score, title, description, evidence, status, raisedAt.
- **`sarif-export`** (format=SARIF): SARIF 2.1.0 — pas de `.hbs`, généré par `SarifBuilder` directement. Le row `ReportTemplate.templateSource` reste vide pour ce template.
- **`json-full-export`** (format=JSON): dump complet structuré { engagement, scans, assets, findings, observations, cveCache } — pas de `.hbs`, généré par `JsonExporter`.

### 4.3 SARIF

`SarifBuilder.build(findings)` produit le squelette `{ "$schema": "https://json.schemastore.org/sarif-2.1.0.json", "version": "2.1.0", "runs": [{ tool: { driver: { name: "AutoScanner", version, rules } }, results: [...] }] }`. Chaque finding → un `result` avec `ruleId`, `level` (mapping severity → SARIF level: critical/high→error, medium→warning, low/info→note), `message.text`, `locations[].physicalLocation.artifactLocation.uri` (canonicalValue de l'asset).

### 4.4 JSON full export

`JsonExporter.serialize(ctx)` retourne un JSON pretty-printed (`JSON.stringify(ctx, null, 2)`). Schéma stable documenté dans `libs/reporting/src/json-schema.md` pour permettre aux clients de scripter dessus (CI/CD, intégrations).

---

## 5. Storage et téléchargement

### 5.1 Layout MinIO bucket `reports`

```
reports/<engagement-id>/<report-id>.<ext>
```

`<ext>` = `pdf|csv|sarif.json|json`. Le bucket `reports` est déjà déclaré comme `StorageBucket` valide dans `libs/storage/src/types.ts:5` — pas de changement nécessaire.

### 5.2 REST endpoint

Nouveau `apps/api-gateway/src/app/reports/reports.controller.ts`:

```
GET /reports/:id/download
  - Auth: session cookie OU bearer (réutiliser AuthGuard existant)
  - Vérifie que le user a accès à l'engagement (même règle que le resolver)
  - Si report.status != READY → 409
  - Stream storage.getObject({ bucket: 'reports', key: report.storageKey }) via @Res() res.send(...)
  - Headers: Content-Type, Content-Length, Content-Disposition: attachment; filename="report-{id}.{ext}"
```

Pourquoi REST en plus de `downloadUrl` GraphQL? La CLI et le CI consomment plus facilement une URL stable côté backend (qui ré-évalue les ACL à chaque requête) qu'une URL signée S3 qu'il faut redemander toutes les heures.

---

## 6. UI

### 6.1 Composants

- `apps/frontend/src/features/reports/generate-report-button.tsx`: bouton + modal avec dropdown template, sélecteur format (si le template offre plusieurs formats — V1 chaque slug a un seul format), bouton "Générer". À l'envoi: mutation, fermeture modal, toast "Rapport en cours de génération".
- `apps/frontend/src/features/reports/recent-reports-panel.tsx`: liste des rapports de l'engagement, polling toutes les 5s tant qu'au moins un est en PENDING/GENERATING. Pour chaque report: nom du template, format badge, status badge, taille, "Télécharger" (lien `downloadUrl`).
- Intégrés dans `apps/frontend/src/features/engagements/engagement-synthesis-page.tsx`: bouton dans le header, panneau dans une nouvelle 4e rangée (ou pied de page).

### 6.2 Refresh temps réel

V1 = polling toutes les 5s sur la liste des rapports tant qu'un report est non-terminal (PENDING ou GENERATING). Pas de subscription dédiée — on évite de complexifier `engagementUpdated`. Si le polling devient un goulet, V2 ajoutera un événement `reportUpdated` au pubsub Redis existant.

---

## 7. Tests

### 7.1 Lib reporting (`libs/reporting/src/__tests__/`)

- `template-engine.spec.ts`: rendu d'un template trivial, vérification que les helpers `severityBadge`, `cvss`, `formatDate`, `truncate`, `riskBucket` produisent la sortie attendue.
- `pdf-renderer.spec.ts`: skip par défaut (Puppeteer = lourd). Activé via `PDF_E2E=1` — produit un PDF en mémoire à partir d'un HTML trivial et vérifie le magic header `%PDF-`.
- `csv-renderer.spec.ts`: rendu d'un tableau, vérification que les caractères spéciaux (virgule, guillemet, retour à la ligne) sont échappés correctement.
- `sarif-builder.spec.ts`: build depuis un set de findings minimal, valide le JSON contre `sarif-2.1.0` (schema embedded), vérifie le mapping severity → level.
- `json-exporter.spec.ts`: round-trip JSON, stabilité de la sortie (clés triées).

### 7.2 Worker (`apps/report-worker/src/app/__tests__/`)

- `report.processor.spec.ts`: mock Prisma + mock storage + mock reporting lib, vérifie l'état machine PENDING → GENERATING → READY (et le passage à FAILED si la lib throw).
- `report.processor.spec.ts` couvre aussi: retry logic au niveau BullMQ (mock la file), filtrage des findings via `Report.filters`.

### 7.3 API gateway (`apps/api-gateway/src/app/reports/__tests__/`)

- `reports.resolver.spec.ts`: `generateReport` crée bien un Report PENDING + enqueue un job. `reports(engagementId)` retourne triée par `createdAt desc`. `downloadUrl` est null avant READY et signé après.
- `reports.controller.spec.ts`: `GET /reports/:id/download` retourne 409 si pas READY, 200 + stream sinon. Vérifie l'ACL engagement.

### 7.4 Frontend (`apps/frontend/src/features/reports/__tests__/`)

- `generate-report-button.spec.tsx` (Vitest + jsdom): l'utilisateur clique, sélectionne `executive-summary-pdf`, soumet, la mutation est appelée avec les bons args, le toast s'affiche.
- `recent-reports-panel.spec.tsx`: rendu d'une liste, le lien de téléchargement est désactivé pour PENDING/GENERATING/FAILED.

### 7.5 E2E (`apps/api-gateway-e2e/src/api-gateway/reporting.e2e.spec.ts`)

Gated `REPORTING_E2E=1` (Postgres + Redis + MinIO requis). Crée un engagement de test, lance un scan factice, déclenche `generateReport` slug=`json-full-export`, attend status=READY, télécharge via `/reports/:id/download`, vérifie que le JSON contient bien l'engagement + au moins un asset. JSON plutôt que PDF pour la vitesse: pas de Puppeteer en boot CI.

---

## 8. Sécurité et fiabilité

- **Accès**: la mutation et la query vérifient que `user.engagements` (relation existante via Session) contient l'engagement. La controller REST réutilise la même vérification dans un guard. Pas d'URL signée publique sans ACL revérifiée — c'est pourquoi on préfère le REST endpoint à `downloadUrl` côté CLI.
- **Timeouts worker**: Puppeteer launch + render plafonné à 30s. Au-delà → FAILED avec `errorMessage="render timeout"`.
- **Concurrence**: la queue `report-jobs` tourne avec `concurrency: 2` (Puppeteer est gourmand en RAM). Configurable via `REPORT_WORKER_CONCURRENCY`.
- **Idempotence**: si une mutation est rejouée (double-clic, retry réseau), elle crée toujours un nouveau `Report`. C'est attendu — l'opérateur peut supprimer manuellement les doublons.
- **Taille**: les rapports sont plafonnés à 50 MB. Au-delà → FAILED avec `errorMessage="report exceeds 50MB cap"`. Spec §16 ne plafonne pas; ce cap est une garde-fou.

---

## 9. Séquençage

L'implémentation est découpée en 4 phases internes:

- **Phase 4.1 — Modèle + lib reporting** (1 PR):
  - Migration Prisma (Report + ReportTemplate + enums + relations inverses).
  - Lib `libs/reporting` avec TemplateEngine, CsvRenderer, SarifBuilder, JsonExporter et tests. PdfRenderer mocké derrière une interface; impl Puppeteer ajoutée mais gated PDF_E2E=1 pour les tests.
  - Seed des 5 ReportTemplate dans `prisma/seed.ts`.

- **Phase 4.2 — Worker + queue** (1 PR):
  - Nouvelle queue `report-jobs` + payload.
  - App `apps/report-worker` avec processor, retry/backoff, tests.

- **Phase 4.3 — GraphQL + REST surface** (1 PR):
  - Resolver + DTOs côté `api-gateway`.
  - Controller REST `/reports/:id/download`.
  - Tests resolver + controller.

- **Phase 4.4 — UI + e2e** (1 PR):
  - Bouton + modal + panneau.
  - Polling.
  - Test Vitest des composants.
  - E2E gated `REPORTING_E2E=1` qui produit un JSON puis le télécharge.

CI doit rester verte après chaque PR; chaque PR est indépendamment révoltable (la Phase 4.1 fonctionne sans 4.2 — pas d'usage; 4.2 sans 4.3 ne casse rien).

---

## 10. Questions ouvertes

1. **Puppeteer vs alternatives**: La spec maître impose Puppeteer (§16.3). C'est lourd à embarquer dans une image Docker. Alternative envisagée: `@react-pdf/renderer` (pure JS, plus léger, pas de Chromium). Tranchage: rester sur Puppeteer pour V1 par fidélité à la spec maître; ouvrir un ticket pour évaluer `@react-pdf/renderer` en V2 si le temps de boot du worker pose problème.
2. **i18n des templates**: V1 fixe FR pour les PDF. Si un client anglophone arrive, il faudra dupliquer chaque slug en `-fr` et `-en`. Hors scope V1.
3. **Lien CLI**: la spec maître mentionne `autoscanner report generate --output report.pdf` (§17.2). La CLI n'est pas dans le scope Phase 4 — elle existe déjà comme app stub. On documente seulement que le REST endpoint est consommable par la CLI; l'implémentation côté CLI sera une PR à part.
