# Phase 4.3 — GraphQL surface + REST download — Plan d'implémentation

> **Date:** 2026-06-12
> **Spec source:** `docs/superpowers/specs/2026-06-12-phase-4-reporting-design.md` §3 (GraphQL), §5.2 (REST).
> **Cycle:** Brainstorming (déjà fait dans la spec maître §16) → Spec → **Plan (ce document)** → Code.
> **Phase précédente:** 4.2 — report-worker app + queue (commit `12ed1bc`).

## Objectif

Exposer la lib `@autoscanner/reporting` et le `report-worker` aux clients via:

1. Mutation `generateReport(input)` — crée un row `Report` PENDING + enqueue sur `report-jobs`.
2. Queries `reports(engagementId)`, `report(id)`, `reportTemplates`.
3. Field resolver `Report.downloadUrl` → URL signée MinIO (TTL 1h, null tant que pas READY).
4. REST endpoint `GET /reports/:id/download` qui stream le contenu MinIO derrière `JwtAuthGuard` + ACL engagement (utile pour CLI + CI/CD).

L'ACL réutilise `Engagement.ownerId` (même règle que `EngagementsService.getByIdForOwner`).

## Critère "done"

- Type-check `pnpm nx run-many --target=type-check --projects=api-gateway` vert.
- Tests `pnpm nx test api-gateway` verts, dont nouveaux: `reports.service.spec.ts`, `reports.resolver.spec.ts`, `reports.controller.spec.ts`.
- `schema.gql` (auto-généré, gitignored) inclut les nouveaux types/mutations/queries après build.
- Aucune régression sur les autres resolvers/controllers.

---

## Tâches

### T1 — DTOs (objects + inputs + enums)

Créer `apps/api-gateway/src/app/reports/dto/`:

- `report-format.enum.ts` — `registerEnumType(ReportFormat, { name: 'ReportFormat' })` re-export du Prisma enum.
- `report-status.enum.ts` — idem pour `ReportStatus`.
- `report-template.object.ts` — `@ObjectType('ReportTemplate')` avec id/slug/name/description/format/isDefault.
- `report.object.ts` — `@ObjectType('Report')` avec id, engagementId, scanId, templateId, format, status, filters (GraphQLJSON), sizeBytes, contentType, errorMessage, createdAt, startedAt, completedAt, downloadUrl (résolu via field resolver). `template` est aussi un champ (`@Field(() => ReportTemplateObject)`) résolu en éager via `include: { template: true }` dans le service.
- `report-filters.input.ts` — `@InputType` avec severityMin (Severity, opt), kinds ([AssetType!], opt), riskScoreMin (Float, opt). Réutilise les enums déjà déclarés.
- `generate-report.input.ts` — `@InputType` avec engagementId (ID!), scanId (ID, opt), templateSlug (String!), filters (ReportFiltersInput, opt).

Référence d'implémentation: `apps/api-gateway/src/app/scans/dto/*` et `assets/dto/asset-detail.object.ts:1-2` (pour `graphql-type-json`).

### T2 — `ReportsService` (`reports.service.ts`)

API:

```ts
class ReportsService {
  generateReport(userId: string, input: GenerateReportInput): Promise<Report>;
  listForOwner(userId: string, engagementId: string): Promise<Report[]>;
  getForOwner(userId: string, reportId: string): Promise<Report>;
  listTemplates(): Promise<ReportTemplate[]>;
  presignDownloadUrl(report: Report): Promise<string | null>;
  streamDownload(userId: string, reportId: string): Promise<{ stream: Readable; contentType: string; sizeBytes: number; filename: string }>;
}
```

Logique:

- **generateReport**: vérifie engagement appartient à l'user (même règle que `ScansService.runScan`). Vérifie `ReportTemplate` existe via `templateSlug` → row trouvée. Si `input.scanId` est fourni, vérifie qu'il appartient à l'engagement. INSERT `Report` PENDING dans une transaction, puis `reportQueue.add('report', { reportId })`. Si l'enqueue échoue, marque le row FAILED puis re-throw (pattern miroir de `ScansService`).
- **listForOwner**: `findMany` sur `Report` joint engagement.ownerId, orderBy `createdAt desc`, include `template`.
- **getForOwner**: `findFirst` + include `template`. Throw `NotFoundError`.
- **listTemplates**: `findMany` ordonné par `format,name`.
- **presignDownloadUrl**: si `status !== READY || !storageKey`, return `null`. Sinon `storage.presignGetUrl({ bucket: 'reports', key, expiresInSeconds: 3600 })`.
- **streamDownload**: récupère le report (ACL), si pas READY throw `ConflictError` (nouveau code dans `@autoscanner/common` ou réutilise `ValidationError`/`NotFoundError`. Décision: utiliser `HttpException(409)` dans le controller — pas besoin de nouvel error type). Sinon retourne `{ stream, contentType, sizeBytes, filename }`.

### T3 — `ReportsResolver`

`apps/api-gateway/src/app/reports/reports.resolver.ts`:

- `@Mutation generateReport(input)` → service.
- `@Query reports(engagementId)` → service.
- `@Query report(id)` → service.
- `@Query reportTemplates()` → service.
- `@ResolveField('downloadUrl', () => String, { nullable: true })` → `service.presignDownloadUrl(parent)`.
- `@ResolveField('template', () => ReportTemplateObject)` — n'est pas nécessaire si on include via Prisma et qu'on map directement; on évite le N+1.

### T4 — `ReportsController` (REST download)

`apps/api-gateway/src/app/reports/reports.controller.ts`:

```
@Controller('reports')
@UseGuards(JwtAuthGuard)
GET :id/download
  - try { const { stream, contentType, sizeBytes, filename } = await svc.streamDownload(user.id, id); }
  - catch NotFoundError → 404
  - if not READY → throw HttpException(409, { code: 'REPORT_NOT_READY', message: '...' })
  - res.setHeader Content-Type, Content-Length, Content-Disposition: attachment; filename="..."
  - stream.pipe(res) — utiliser @Res() et stream.pipe directement
```

Le streaming `stream.pipe(res)` cohabite mal avec le retour de l'handler Nest. Pattern: `@Res() res` + `stream.pipe(res)` + `return new Promise((resolve, reject) => stream.on('end', resolve).on('error', reject))`.

### T5 — `ReportsModule` + wiring AppModule

`reports.module.ts`:

```ts
@Module({
  imports: [AuthModule, QueuesModule, BullModule.registerQueue({ name: QueueName.REPORT_JOBS })],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsResolver],
})
```

`app.module.ts`: ajouter `ReportsModule` à la liste d'imports.

### T6 — Tests

- `reports.service.spec.ts` (~6 it):
  - generateReport: succès → INSERT + enqueue avec bons args.
  - generateReport: engagement inexistant pour user → NotFoundError.
  - generateReport: template slug inexistant → NotFoundError.
  - generateReport: enqueue throw → row marqué FAILED + re-throw.
  - listForOwner: filtre bien sur ownerId.
  - presignDownloadUrl: null si pas READY, signé si READY.
- `reports.resolver.spec.ts` (~3 it):
  - generateReport → délègue au service.
  - reports → délègue.
  - downloadUrl → délègue à `presignDownloadUrl`.
- `reports.controller.spec.ts` (~3 it):
  - download: report READY → headers + pipe stream.
  - download: report PENDING/GENERATING → HttpException 409.
  - download: NotFoundError → HttpException 404.

### T7 — Validation + commit

- `pnpm nx test api-gateway`
- `pnpm nx run-many --target=type-check --projects=api-gateway,parser-worker,cve-enricher-worker,report-worker`
- Commit: `feat(phase-4.3): GraphQL reports surface + REST /reports/:id/download`.

## Hors scope (réservé Phase 4.4)

- Composants React + polling.
- Hooks Apollo client.
- Test e2e gated `REPORTING_E2E=1`.
- Mise à jour de subscriptions `engagementUpdated` pour pousser le passage READY (v1 = polling).
