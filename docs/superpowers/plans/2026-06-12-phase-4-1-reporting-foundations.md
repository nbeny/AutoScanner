# Phase 4.1 — Reporting Foundations — Implementation Plan

> **Date:** 2026-06-12
> **Spec:** `docs/superpowers/specs/2026-06-12-phase-4-reporting-design.md` §9 (Séquençage — Phase 4.1).
> **Scope:** Migration Prisma (Report + ReportTemplate + enums + relations), lib `@autoscanner/reporting` (TemplateEngine + CsvRenderer + SarifBuilder + JsonExporter + PdfRenderer interface), seed des 5 templates.
> **Out of scope:** Worker, GraphQL surface, UI — voir Phases 4.2/4.3/4.4.

---

## Pré-requis

- Master spec §16; spec Phase 4 §1-§4.
- Prisma schema actuel: `User`, `Engagement`, `Scan`, `Session`, etc. (lignes 17/66/184).
- Storage bucket `reports` déjà déclaré dans `libs/storage/src/types.ts:5`.

---

## T1 — Prisma migration: Report + ReportTemplate

- [ ] **T1.1** — Ajouter à `prisma/schema.prisma` (après le bloc `CveCache`):
  - `enum ReportFormat { PDF CSV SARIF JSON }`
  - `enum ReportStatus { PENDING GENERATING READY FAILED }`
  - `model ReportTemplate` (cf. spec §2.1).
  - `model Report` (cf. spec §2.1).
- [ ] **T1.2** — Ajouter les relations inverses:
  - `User`: `reports Report[]` (ligne ~31, à côté de `engagements`).
  - `Engagement`: `reports Report[]`.
  - `Scan`: `reports Report[]`.
- [ ] **T1.3** — Générer la migration: `pnpm prisma migrate dev --name add_reports_phase_4`. La migration doit être déterministe (pas de drift après re-run).
- [ ] **T1.4** — `pnpm prisma generate` — vérifier que le client est mis à jour.
- [ ] **T1.5** — Lint le schema: `pnpm prisma format`.

**Definition of done:** `pnpm prisma migrate status` rapporte la nouvelle migration appliquée, le client est régénéré, `git status` montre `schema.prisma` modifié et un nouveau dossier `prisma/migrations/<timestamp>_add_reports_phase_4/`.

---

## T2 — Lib `@autoscanner/reporting`: squelette

- [ ] **T2.1** — Générer la lib via Nx: `pnpm nx g @nx/js:library reporting --directory=libs/reporting --bundler=tsc --unitTestRunner=jest --importPath=@autoscanner/reporting --tags=scope:shared,type:lib`.
- [ ] **T2.2** — Ajouter `package.json` dependencies dans `libs/reporting/package.json` (ou racine selon convention Nx):
  - `handlebars`
  - `csv-stringify`
  - `puppeteer` (peerDependency — installé dans `apps/report-worker` ensuite)
- [ ] **T2.3** — Vérifier `tsconfig.json` (paths déjà alias `@autoscanner/reporting`).
- [ ] **T2.4** — Créer `libs/reporting/src/index.ts` qui re-exporte: `TemplateEngine`, `PdfRenderer` (interface + impl Puppeteer derrière feature flag), `CsvRenderer`, `SarifBuilder`, `JsonExporter`, types.

**Definition of done:** `pnpm nx build reporting` passe, l'import `import { TemplateEngine } from '@autoscanner/reporting'` est résolu par le TS dans une app sans erreur.

---

## T3 — TemplateEngine (Handlebars + helpers)

- [ ] **T3.1** — Créer `libs/reporting/src/template-engine.ts`:
  - Classe `TemplateEngine` avec constructeur enregistrant les helpers.
  - Méthode `render(templateSource: string, ctx: unknown): string`.
  - Helpers: `severityBadge`, `cvss`, `formatDate`, `truncate`, `riskBucket`, `count`, `eq`, `gt`, `lt`.
- [ ] **T3.2** — Tests `libs/reporting/src/__tests__/template-engine.spec.ts`:
  - Rendu d'un template `"{{name}} {{severityBadge severity}}"` produit la sortie attendue pour chaque sévérité.
  - `cvss(7.5)` → `"7.5 (HIGH)"`, `cvss(null)` → `"—"`.
  - `formatDate("2026-06-12T14:30:00Z")` → `"2026-06-12 14:30:00 UTC"`.
  - `truncate("hello world", 5)` → `"hello…"`.
  - `riskBucket(85)` → `"CRITICAL"`, `riskBucket(0)` → `"INFO"`.

**Definition of done:** `pnpm nx test reporting --testPathPattern=template-engine` passe.

---

## T4 — CsvRenderer

- [ ] **T4.1** — Créer `libs/reporting/src/csv-renderer.ts`:
  - Classe `CsvRenderer` avec méthode `render(rows: Record<string, unknown>[], columns: string[]): string`.
  - Délègue à `csv-stringify/sync`, header inclus.
  - Gère les valeurs `null`/`undefined` (sortie = chaîne vide).
- [ ] **T4.2** — Tests `libs/reporting/src/__tests__/csv-renderer.spec.ts`:
  - Cas normal: 2 lignes, 3 colonnes.
  - Caractères spéciaux: virgule, guillemet, newline dans une cellule sont quotés/échappés.
  - Valeurs manquantes deviennent des chaînes vides.

**Definition of done:** `pnpm nx test reporting --testPathPattern=csv-renderer` passe.

---

## T5 — SarifBuilder

- [ ] **T5.1** — Créer `libs/reporting/src/sarif-builder.ts`:
  - Type `SarifFindingInput` (cveId?, ruleId, severity, title, description, assetCanonicalValue).
  - Classe `SarifBuilder` avec méthode `build(findings: SarifFindingInput[], toolVersion: string): object`.
  - Produit `{ $schema, version: "2.1.0", runs: [{ tool: { driver: { name: "AutoScanner", version, rules: [...] } }, results: [...] }] }`.
  - Mapping severity → level: critical/high→`error`, medium→`warning`, low/info→`note`.
- [ ] **T5.2** — Tests `libs/reporting/src/__tests__/sarif-builder.spec.ts`:
  - 3 findings (1 par bucket de level) produisent les `result.level` attendus.
  - `tool.driver.rules` est dédoublonné par `ruleId`.
  - Le JSON sérialisé est parseable et contient les clés `$schema`/`version`/`runs`.

**Definition of done:** `pnpm nx test reporting --testPathPattern=sarif-builder` passe.

---

## T6 — JsonExporter

- [ ] **T6.1** — Créer `libs/reporting/src/json-exporter.ts`:
  - Type `ReportContext` (engagement, scans, assets, findings, observations, cveCache) — non-exhaustif au début, complété quand le worker l'utilisera.
  - Classe `JsonExporter` avec méthode `serialize(ctx: ReportContext): string`.
  - `JSON.stringify(ctx, null, 2)`; trie les clés top-level pour déterminisme.
- [ ] **T6.2** — Tests `libs/reporting/src/__tests__/json-exporter.spec.ts`:
  - Round-trip: `JSON.parse(serialize(ctx))` retourne `ctx`.
  - Ordre des clés top-level stable malgré insertions désordonnées.

**Definition of done:** `pnpm nx test reporting --testPathPattern=json-exporter` passe.

---

## T7 — PdfRenderer (interface + impl Puppeteer gated)

- [ ] **T7.1** — Créer `libs/reporting/src/pdf-renderer.ts`:
  - Interface `PdfRenderer { renderHtml(html: string, opts?: { format?: 'A4' }): Promise<Buffer> }`.
  - Impl `PuppeteerPdfRenderer implements PdfRenderer` qui lance `puppeteer.launch({ headless: true, args: ['--no-sandbox'] })`, set le HTML, `page.pdf({ format: 'A4' })`.
  - Token DI `PDF_RENDERER` exporté pour usage dans le worker.
- [ ] **T7.2** — Tests `libs/reporting/src/__tests__/pdf-renderer.spec.ts`:
  - Gated `PDF_E2E=1`: lance le renderer réel, produit un PDF, vérifie le magic header `Buffer.from('%PDF-')` au début.
  - Sans flag: skip via `describe.skip`.

**Definition of done:** `pnpm nx test reporting --testPathPattern=pdf-renderer` passe (test skip par défaut).

---

## T8 — Sources Handlebars + seed des 5 templates

- [ ] **T8.1** — Créer le répertoire `libs/reporting/src/templates/`:
  - `executive-summary.hbs` — squelette HTML A4: en-tête engagement, scorecard (riskScore moyen), donut SVG (rendu statique côté Handlebars: 4 path), top 10 findings (tableau), recommandations.
  - `technical-detailed.hbs` — boucle `{{#each assets}}` avec section par asset (riskScore, ports, services, technologies, findings).
- [ ] **T8.2** — Exposer les sources via `libs/reporting/src/template-sources.ts`:
  ```ts
  import fs from 'node:fs';
  import path from 'node:path';
  const dir = path.join(__dirname, 'templates');
  export const TEMPLATE_SOURCES = {
    executiveSummary: fs.readFileSync(path.join(dir, 'executive-summary.hbs'), 'utf8'),
    technicalDetailed: fs.readFileSync(path.join(dir, 'technical-detailed.hbs'), 'utf8'),
  };
  ```
  (les sources HBS sont copiées dans `dist/templates/` par Nx — vérifier `project.json` `assets`).
- [ ] **T8.3** — Modifier `prisma/seed.ts` pour upsert les 5 `ReportTemplate`:
  - `executive-summary-pdf` (PDF, templateSource = `TEMPLATE_SOURCES.executiveSummary`).
  - `technical-detailed-pdf` (PDF, templateSource = `TEMPLATE_SOURCES.technicalDetailed`).
  - `findings-csv` (CSV, templateSource = '').
  - `sarif-export` (SARIF, templateSource = '').
  - `json-full-export` (JSON, templateSource = '').
- [ ] **T8.4** — Vérifier que `pnpm prisma db seed` est idempotent (upsert sur `slug`).

**Definition of done:** `pnpm prisma db seed` insère/met-à-jour 5 rows dans `ReportTemplate`, vérifiable via `SELECT slug FROM "ReportTemplate"`.

---

## T9 — Validation cross-cutting

- [ ] **T9.1** — `pnpm nx run-many --target=lint --projects=reporting` — pas d'erreur eslint.
- [ ] **T9.2** — `pnpm nx run-many --target=test --projects=reporting` — tous les tests verts.
- [ ] **T9.3** — `pnpm nx run-many --target=build --projects=reporting` — build TS sans erreur.
- [ ] **T9.4** — `pnpm nx affected:test --base=main` — pas de régression sur les apps existantes (parser-worker, api-gateway, etc.) à cause de la migration Prisma.
- [ ] **T9.5** — Commit unique: `feat(phase-4.1): add Report/ReportTemplate models + @autoscanner/reporting lib (per spec §2.1, §4.2)`.

**Definition of done:** Tous les checks ci-dessus passent, le commit est sur main, push.

---

## Risques et mitigations

- **Risque:** la migration Prisma drift entre dev et CI si le timestamp diffère. **Mitigation:** générer la migration localement, vérifier qu'elle s'applique sur une base vierge (`pnpm prisma migrate reset --skip-seed`).
- **Risque:** Puppeteer n'est pas disponible dans l'image Docker CI. **Mitigation:** T7.2 est gated; le worker (Phase 4.2) installera explicitement le binaire Chromium via `puppeteer` ou un dockerfile dédié.
- **Risque:** les fichiers `.hbs` ne sont pas copiés dans `dist/` après build Nx. **Mitigation:** vérifier `libs/reporting/project.json` → `targets.build.options.assets` inclut `["libs/reporting/src/templates/**/*.hbs"]`.
- **Risque:** `csv-stringify` v6+ a une API ESM-only qui casse en Jest. **Mitigation:** utiliser `csv-stringify/sync` (CJS-friendly).

---

## Prochaine étape

Une fois Phase 4.1 mergé, enchaîner sur **Phase 4.2 — Worker + queue** (plan séparé, `2026-06-12-phase-4-2-report-worker.md`).
