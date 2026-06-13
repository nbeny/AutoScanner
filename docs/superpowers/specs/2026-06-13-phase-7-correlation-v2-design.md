# Phase 7 — Correlation Engine v2 — Design

> **Date:** 2026-06-13
> **Statut:** Spec V1 — issue d'un brainstorm, en attente de revue avant `writing-plans`.
> **Cycle:** Brainstorming → **Spec (ce document)** → Plan d'implémentation → Code.
> **Spec maître:** `docs/superpowers/specs/2026-05-24-autoscanner-platform-design.md` §1 Phase 4 (correlation v2).
> **Indépendant** du stack recon (branches `phase-6.x`): opère sur le modèle `Finding`/correlation de Phase 3, présent sur `main`.

## 1. Objectif et critère "done"

**Objectif:** dépasser la déduplication *per-scanner* (v1) pour atteindre la **corrélation cross-scanner**: le même problème détecté par plusieurs scanners (ex. "TLS 1.0 activé" vu par `tlsx`, `sslscan` et `nuclei`, ou la même CVE rapportée par deux outils) est regroupé en **un seul finding corrélé** portant N sources, au lieu de N lignes `Finding` distinctes. Plus un **risk score v2** qui compte chaque problème une seule fois et utilise les vrais scores CVSS.

**État actuel (v1, déjà livré):**
- `Finding.dedupHash` inclut `scannerName` → `@@unique([assetId, dedupHash])`: une ligne par (asset, scanner, signature). Deux scanners = deux lignes, jamais regroupées.
- Enrichissement CVE existant: `apps/cve-enricher-worker`, `libs/cve` (client NVD), cache CVE (`phase3_cve_cache`), GraphQL `cve-info`.
- Risk score v1 (`libs/correlation/risk-score.ts`): somme pondérée par buckets de sévérité + bonus ports sensibles + bonus admin exposé. Somme sur les `Finding` bruts (donc triple-compte le même problème vu par 3 scanners).

**Critère "done" Phase 7:**
1. Modèle `CorrelatedFinding` (cluster) + migration; chaque `Finding` brut lié à son cluster via `correlatedFindingId`.
2. Signature structurelle déterministe (CVE → catégorie curée → fallback per-scanner) implémentée et testée (idempotence, indépendance d'ordre, zéro merge erroné des inconnus).
3. `CorrelationService.correlateFindings` invoqué par `parser-worker` après la persistance des findings; clusters agrégés (sévérité max, sourceCount, cveId, lastSeenAt).
4. Risk score v2: recalcul depuis les `CorrelatedFinding` (chaque problème compté une fois) avec CVSS réel quand disponible; clusters `FALSE_POSITIVE`/`RESOLVED` exclus.
5. GraphQL `correlatedFindings(engagementId, …)` + mutation `setFindingStatus`; UI groupe par finding corrélé (dépliable vers les N sources) + dropdown de triage.
6. CI verte; suite e2e env-gated étendant l'existant.

---

## 2. Architecture

### 2.1 Modèle de données

```prisma
enum FindingStatus { OPEN TRIAGED CONFIRMED FALSE_POSITIVE RESOLVED }

model CorrelatedFinding {
  id             String        @id @default(cuid())
  engagementId   String
  assetId        String
  structuralHash String        // scanner-indépendant
  category       String?       // catégorie curée (null si CVE-keyé ou fallback)
  title          String        // représentatif (CVE id / libellé catégorie / 1er finding)
  severity       Severity      // max des sources
  cveId          String?
  status         FindingStatus @default(OPEN)
  sourceCount    Int           @default(0) // # de scanners distincts
  firstSeenAt    DateTime      @default(now())
  lastSeenAt     DateTime      @default(now())

  engagement Engagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  asset      Asset      @relation(fields: [assetId], references: [id], onDelete: Cascade)
  findings   Finding[]

  @@unique([assetId, structuralHash])
  @@index([engagementId])
  @@index([assetId])
  @@index([severity])
  @@index([status])
}
```

Évolution de `Finding` (additive, non-cassante):
- `+ correlatedFindingId String?` (FK → `CorrelatedFinding`, `onDelete: SetNull`).
- `+ structuralHash String?` (dénormalisé pour re-corrélation/debug; nullable car migration des lignes existantes).
- **`dedupHash` + `@@unique([assetId, dedupHash])` inchangés** — la déduplication brute per-scanner reste; la corrélation est une couche au-dessus.
- Relations: `Finding.correlatedFinding CorrelatedFinding?`. Back-relations `correlatedFindings CorrelatedFinding[]` sur `Engagement` et `Asset`.

Migration manuelle (pas de Postgres local): `CorrelatedFinding` table + enum `FindingStatus` + 2 colonnes sur `Finding` + FKs. Les `Finding` existants ont `correlatedFindingId = NULL` jusqu'à un recompute (la corrélation re-tourne au prochain parse, ou via un backfill optionnel — voir §5 D1).

### 2.2 Signature structurelle (`libs/correlation`)

Nouvelle fonction pure `structuralFindingHash(input)` (déterministe, ordre-indépendant):

```
input: { scannerName, cveId?, assetCanonical, location?, title, templateId? }

1. cveId présent      → sha256('cve|' + cveId + '|' + assetCanonical + '|' + (location ?? ''))
2. sinon, règle match → sha256('cat|' + category + '|' + assetCanonical + '|' + (location ?? ''))
3. sinon (inconnu)    → sha256('raw|' + scannerName + '|' + assetCanonical + '|' + (location ?? '') + '|' + title)
```

- **Cas 1 (CVE)**: regroupement cross-scanner haute confiance — deux outils rapportant la même CVE sur le même asset/location fusionnent.
- **Cas 2 (catégorie)**: table de règles curée `FINDING_CATEGORY_RULES` (ordonnée; 1ère qui matche gagne), chaque règle = `{ category, match: RegExp }` testée contre `title` (et optionnellement `templateId`). Set de départ (~12), couvrant les recoupements cross-scanner courants:
  - `weak-tls-protocol` (`/weak (ssl|tls) (protocol|version)|(ssl|tls)v1\.[01] enabled/i`)
  - `self-signed-cert` (`/self[- ]signed/i`)
  - `expired-cert` (`/expired .*certificate/i`)
  - `weak-cipher` (`/weak cipher|rc4|export cipher/i`)
  - `directory-listing` (`/directory (listing|index)/i`)
  - `default-credentials` (`/default (credential|password|login)/i`)
  - `exposed-admin-panel` (`/admin (panel|interface|console) exposed/i`)
  - `missing-security-header` (`/missing .*(security )?header|x-frame-options|hsts|csp/i`)
  - `open-redirect`, `cors-misconfig`, `exposed-git`, `exposed-env-file`.
- **Cas 3 (fallback)**: aucun CVE, aucune règle → signature per-scanner ⇒ cluster singleton. **Les inconnus ne sont jamais fusionnés à tort** (choix de sûreté validé en brainstorm).

La table de règles vit dans `libs/correlation/finding-categories.ts`, testée unitairement (chaque règle a ≥1 exemple positif + 1 négatif).

### 2.3 CorrelationService v2

Lib `libs/correlation/correlate-findings.service.ts`, injectée dans `parser-worker`, appelée **après** la persistance + dédup v1 des findings (là où `dedupFindings` tourne aujourd'hui), dans la même transaction de réconciliation.

`correlateFindings(engagementId, tx)`:
1. Charge les `Finding` de l'engagement (ou le sous-ensemble du scanJob + leurs siblings au même asset/structuralHash — voir D2).
2. Pour chaque finding: calcule `structuralHash` (via `structuralFindingHash`, avec `assetCanonical` résolu depuis l'asset). `upsert` du `CorrelatedFinding` par `(assetId, structuralHash)`. Lie `finding.correlatedFindingId` + écrit `finding.structuralHash`.
3. Recalcule les agrégats du cluster: `severity` = max des findings liés, `sourceCount` = # de `scannerName` distincts (via les `scanJob.scannerName` des findings), `cveId` = premier non-null, `category`, `title` (CVE id si présent, sinon libellé de catégorie, sinon titre du 1er finding), `lastSeenAt` = max, `firstSeenAt` = min.
4. **Préserve `status`** posé par l'opérateur entre les re-runs (ne réinitialise jamais à OPEN un cluster existant).
5. Idempotent + ordre-indépendant. Re-scan: re-lie, met à jour `sourceCount`/`lastSeenAt`. Suppression d'un finding (re-scan qui ne le retrouve pas): le cluster décrémente; un cluster sans findings est élagué (ou marqué — voir D3).

Tests: idempotence, ordre-indépendant, fusion CVE cross-scanner, fusion catégorie cross-scanner, non-fusion des inconnus, préservation du status.

### 2.4 Risk score v2

Étend `libs/correlation/risk-score.ts` + `recompute-risk-score.ts`:
- Somme sur les **`CorrelatedFinding`** de l'asset (chaque problème compté **une fois** — corrige le triple-comptage v1).
- Poids par cluster = **CVSS réel** quand disponible (depuis le cache CVE / `libs/cve`), sinon fallback sur le poids de sévérité existant (`SEVERITY_WEIGHT`).
- Conserve les bonus d'exposition existants (ports sensibles, admin exposé).
- Exclut les clusters `FALSE_POSITIVE` et `RESOLVED`.
- `recompute-risk-score` consomme désormais les clusters de l'asset (au lieu des findings bruts).

Tests: compte-une-fois (3 sources même problème = 1× poids), CVSS utilisé quand présent, fallback sévérité, exclusion FALSE_POSITIVE/RESOLVED, bonus exposition préservés.

### 2.5 Surface (GraphQL + frontend)

- **GraphQL** (`apps/api-gateway`): 
  - `CorrelatedFindingObject { id, assetId, structuralHash, category?, title, severity, cveId?, status, sourceCount, sources: [String!]!, firstSeenAt, lastSeenAt, findings: [FindingObject!]! }` (`sources` = scannerNames distincts, résolu via les findings).
  - Query `correlatedFindings(engagementId, severity?, status?, search?, limit?, offset?)` (engagement-scoped, gardée JwtAuthGuard + ownership comme les autres).
  - Mutation `setFindingStatus(correlatedFindingId, status): CorrelatedFindingObject` (triage).
- **Frontend**: la vue findings groupe par finding corrélé (ligne cluster dépliable vers ses N sources), badge `sources`/`sourceCount`, dropdown de statut (triage). Réutilise le pattern d'onglet/tableau existant.

---

## 3. Séquencement (vertical slice)

### Étape 1 — Engine + modèle
Migration `CorrelatedFinding` + enum + colonnes `Finding`; `structuralFindingHash` + `FINDING_CATEGORY_RULES`; `CorrelateFindingsService` câblé dans `parser-worker` (après dédup, dans la tx); aggregates + préservation status; tests unitaires (signature, service). Pas d'UI.

### Étape 2 — Risk v2
`risk-score` v2 (CVSS + compte-une-fois sur clusters) + `recompute-risk-score` depuis les clusters; tests. Recompute déclenché là où v1 recalcule (après corrélation).

### Étape 3 — Surface
GraphQL `correlatedFindings` + `setFindingStatus` (+ service ownership-checké, tests mock Prisma); frontend vue corrélée + triage; e2e env-gated (`correlation-v2-e2e`: un engagement avec findings multi-source → 1 cluster à N sources; muter le status; risk score reflète le compte-une-fois).

---

## 4. Risques

1. **Sur-fusion (faux regroupements)** via une règle catégorie trop large → deux problèmes distincts fusionnés. *Mitigation:* fallback per-scanner par défaut (les inconnus ne fusionnent jamais); chaque règle testée avec un cas négatif; règles ancrées sur `location` en plus de la catégorie.
2. **Migration des `Finding` existants** (`correlatedFindingId` NULL au départ). *Mitigation:* corrélation re-tourne au prochain parse; backfill optionnel one-shot (D1). Colonnes nullable → migration non-cassante.
3. **CVSS indisponible** (CVE pas encore enrichie, ou pas de CVE). *Mitigation:* fallback déterministe sur `SEVERITY_WEIGHT`; le risk v2 reste calculable.
4. **Cohérence corrélation ↔ dédup v1** dans la même transaction (ordre des opérations). *Mitigation:* corrélation strictement après la persistance + dédup; tests d'intégration de l'ordre dans `parse-job.processor`.
5. **Coût** (recharger tous les findings de l'engagement à chaque parse). *Mitigation:* corréler par asset+structuralHash impactés (D2), pas tout l'engagement, si la perf le justifie.

---

## 5. Décisions ouvertes

À trancher avant/pendant `writing-plans`.

- **D1 — Backfill des findings existants ?** Recommandation: pas de migration de données obligatoire; la corrélation se matérialise au prochain parse. Fournir un script `nx run ...:correlate-backfill` optionnel si besoin de corréler l'historique sans re-scan.
- **D2 — Portée du recompute de corrélation:** tout l'engagement vs. seulement les assets/structuralHash touchés par le scanJob courant. Recommandation: portée par asset touché (suffisant + borné); élargir si un cas le nécessite.
- **D3 — Clusters orphelins** (plus aucun finding lié après re-scan): élaguer (delete) vs. garder pour l'historique. Recommandation: élaguer (delete) pour garder la vue propre; `firstSeenAt` vit sur le cluster donc l'historique fin est porté par les observations, pas le cluster.
- **D4 — `status` au niveau cluster vs finding ?** Recommandation: cluster (un triage par problème logique). Confirmé en brainstorm.
- **D5 — Reports basculent sur les correlated findings ?** Recommandation: hors-scope Phase 7; les templates Phase 4 continuent sur les `Finding` bruts. Bascule = suivi ultérieur.

---

## 6. Plan de tests

- **Unit** `correlation`: `structuralFindingHash` (3 cas + idempotence + ordre-indépendant), `FINDING_CATEGORY_RULES` (positif/négatif par règle), `correlateFindings` (fusion CVE, fusion catégorie, non-fusion inconnus, agrégats, préservation status), `risk-score` v2 (compte-une-fois, CVSS, fallback, exclusions).
- **Integration** `parser-worker`: corrélation tourne après dédup dans la tx; `ParseJobResult` gagne `correlatedFindings` count.
- **API** `api-gateway`: `correlatedFindings` service (ownership, filtres), `setFindingStatus` (mute le cluster).
- **Frontend**: la vue corrélée rend clusters + sources + triage (MockedProvider).
- **E2E env-gated** `correlation-v2-e2e` (opt-in `E2E_RUN_CORRELATION`): findings multi-source → 1 cluster N sources, mutation status, risk reflète compte-une-fois.

---

## 7. Hors-scope Phase 7

- Corrélation floue / ML (déterministe uniquement).
- Reports consommant les correlated findings (templates Phase 4 inchangés — D5).
- Corrélation cross-asset (un même problème sur plusieurs assets reste N clusters).
- Auto-triage / suppression automatique de faux positifs (le status est manuel).
