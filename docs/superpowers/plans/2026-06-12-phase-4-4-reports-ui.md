# Phase 4.4 — Reports UI + e2e — Plan d'implémentation

> **Date:** 2026-06-12
> **Spec source:** `docs/superpowers/specs/2026-06-12-phase-4-reporting-design.md` §6 (UI), §7.4 (Frontend tests), §7.5 (E2E).
> **Phase précédente:** 4.3 — GraphQL surface (commit `8d8ead5`).

## Objectif

Donner aux opérateurs un accès humain à la pipeline reports déployée en 4.1–4.3:

1. Bouton "Générer rapport" dans l'en-tête de la synthèse engagement.
2. Modal/dropdown qui liste les `reportTemplates` et soumet `generateReport`.
3. Panneau "Rapports récents" qui poll toutes les 5s tant qu'un report est PENDING/GENERATING.
4. Lien "Télécharger" pointant vers `/reports/:id/download` (REST) — visible quand status=READY.

V1 = polling 5s, pas de subscription. La spec maître §16 fixe ce choix pour éviter de complexifier `engagementUpdated`.

## Critère "done"

- Vitest verts: `generate-report-button.spec.tsx` + `recent-reports-panel.spec.tsx`.
- Jest verts: aucun changement aux autres tests.
- Type-check vert.
- E2E `reporting-e2e.spec.ts` skip par défaut (pas de Postgres/Redis local), passe quand `REPORTING_E2E=1` + stack démarrée.

---

## Tâches

### T1 — GraphQL operations (`apps/frontend/src/lib/graphql/queries.ts`)

Ajouter à la fin du fichier:

```graphql
query Reports($engagementId: ID!) {
  reports(engagementId: $engagementId) {
    id format status sizeBytes contentType errorMessage
    createdAt startedAt completedAt downloadUrl
    template { id slug name format }
  }
}

query ReportTemplates {
  reportTemplates { id slug name description format isDefault }
}

mutation GenerateReport($input: GenerateReportInput!) {
  generateReport(input: $input) { id status format template { id slug name } }
}
```

### T2 — `GenerateReportButton` (`apps/frontend/src/features/reports/generate-report-button.tsx`)

Comportement:
- Charge `REPORT_TEMPLATES_QUERY` au montage (cache friendly).
- Pré-sélectionne le premier template (le seed met `executive-summary-pdf` en premier).
- Bouton "Générer rapport" ouvre un panneau inline avec `<select>` template + bouton "Générer".
- À la soumission: `generateReport({ engagementId, templateSlug })`, refetch `REPORTS_QUERY` via `refetchQueries`.
- Affiche un message de confirmation transient.

Pattern emprunté à `new-template-run-form.tsx`.

### T3 — `RecentReportsPanel` (`apps/frontend/src/features/reports/recent-reports-panel.tsx`)

- `useQuery(REPORTS_QUERY, { variables: { engagementId }, pollInterval: ... })`.
- `pollInterval = hasPendingOrGenerating ? 5000 : 0` (dynamique).
- Pour chaque report: badge format, badge status, taille, "Télécharger" lien (`href={downloadUrl}` OU lien REST `/reports/${id}/download` — préférer REST pour stabilité).
- Si status = FAILED, afficher errorMessage.

Décision: lien `<a href="/reports/${id}/download" target="_blank">` plutôt que `downloadUrl` MinIO. Raison: cookies de session sont automatiquement attachés au call REST same-origin, vs URL signée qui expire en 1h et fuite si copiée.

### T4 — Intégration `EngagementSynthesisPage`

- Ajouter `<GenerateReportButton engagementId={...} />` dans la section header (à côté du lien "Run scans →").
- Ajouter `<RecentReportsPanel engagementId={...} />` en bas comme nouvelle rangée.

### T5 — Tests Vitest

`generate-report-button.spec.tsx`:
- Render → click "Générer rapport" → select pré-sélectionne template → submit → mutation appelée avec bons args.

`recent-reports-panel.spec.tsx`:
- Render avec 1 PENDING + 1 READY: la PENDING n'a pas de lien, la READY a un `<a>` `/reports/.../download`.
- Render empty state.
- FAILED affiche errorMessage.

### T6 — E2E gated `REPORTING_E2E=1`

`apps/api-gateway-e2e/src/scenarios/reporting-e2e.spec.ts`:

- `describeOrSkipE2E(env, { reportingEnabled })` — skip si `REPORTING_E2E !== '1'`.
- Login → engagement → `generateReport({ templateSlug: 'json-full-export' })`.
- Poll `reports(engagementId)` jusqu'à status=READY ou timeout.
- Fetch `GET /reports/:id/download` via fetch authentifié, parse JSON, assert `engagement.id` égal.

Pourquoi `json-full-export`? Pas de Puppeteer = pas de Chromium dans le worker pour ce test = boot 30s plus rapide.

### T7 — Validation + commit

- `pnpm nx test frontend` (Vitest)
- `pnpm nx test api-gateway-e2e` (skip gated)
- `pnpm nx type-check api-gateway-e2e,frontend`
- Commit: `feat(phase-4.4): reports UI + REPORTING_E2E scenario`.

## Hors scope

- Édition des templates côté UI.
- Subscription `reportUpdated` (V2).
- CLI `autoscanner report generate` (PR future séparée).
