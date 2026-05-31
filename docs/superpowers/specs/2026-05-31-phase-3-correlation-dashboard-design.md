# Phase 3 — Correlation Dashboard — Design

> **Date:** 2026-05-31
> **Statut:** Spec V1 — issu d'un brainstorm, en attente de revue avant `writing-plans`.
> **Cycle:** Brainstorming → **Spec (ce document)** → Plan d'implémentation → Code.
> **Spec maître:** `docs/superpowers/specs/2026-05-24-autoscanner-platform-design.md` (plateforme).
> **Spec précédent:** `docs/superpowers/specs/2026-05-27-phase-2-recon-chain-design.md` (Phase 2 — recon chain).

Ce document définit Phase 3. Phase 1 a livré le scan unitaire, Phase 2 a livré la recon chain et le modèle relationnel riche (Domain/Subdomain/IpAddress/Port/Service/Technology/DnsRecord/Finding). Phase 3 transforme cette donnée déjà persistée en un dashboard qui rend la corrélation cross-scanner lisible et actionnable, et ajoute deux capacités: un score de risque déterministe sur chaque asset, et l'enrichissement CVE depuis NVD.

---

## 1. Objectif et critère "done"

**Objectif:** transformer le frontend de "tables côte à côte" en surface qui raconte l'histoire d'un engagement. Un opérateur ouvre `/engagements/<id>` et voit en quelques secondes: l'état de la surface d'attaque, les findings prioritaires, les assets les plus risqués, et l'activité récente. Il clique sur un asset et voit toute son histoire cross-scanner (subfinder l'a découvert, dnsx l'a résolu, naabu a ouvert un port, httpx a fingerprint, nuclei a raised un finding) dans une timeline unique. Pendant qu'un template-run tourne, la page se met à jour sans F5.

**Critère "done" Phase 3:**

1. Route `/engagements/:id` affiche une page de synthèse 3-rangées (counters surface d'attaque + donut sévérité, Top findings + Top assets risqués, timeline runs récents).
2. La liste assets gagne une colonne `riskScore` triable + un panneau de facettes (kind, severity, port ranges, tech name, scanner source).
3. Nouvelle route `/engagements/:eid/assets/:aid` avec 4 onglets: Provenance (timeline cross-scanner), Réseau (IPs/ports/services), Tech & DNS, Findings.
4. `Asset.riskScore` est calculé déterministe par `parser-worker` après chaque persist, en pure function de `findings + ports + services + (cve_bonus)`.
5. Table `AssetObservation` écrite à chaque persist par `parser-worker`; alimente la timeline Provenance.
6. Enrichissement CVE: `cve-enricher-worker` consomme une file BullMQ, hit l'API NVD, cache 30j dans `CveCache`. Top findings (synthèse) et onglet Findings (asset detail) affichent CVSS + summary quand dispo.
7. GraphQL subscription `engagementUpdated(id)` notifie le front; refresh ciblé via Apollo `refetchQueries`.
8. CI verte; suite e2e env-gated `correlation-dashboard-e2e` étend l'existant.

**Non-buts (out of scope v1):**

- Cross-scanner finding fusion intelligente (ex: nuclei + nikto même vuln → 1 finding). Reste exact dedup par hash.
- Graphe visuel Domain → Subdomain → IP → Port → Finding (D3/cytoscape). Reste tables + timeline.
- Reporting client / export PDF.
- Multi-utilisateur, partage d'engagement.
- Notifications externes (mail, Slack, webhook).

---

## 2. Architecture des nouveaux blocs

### 2.1 Modèle de données

**Nouvelle table `AssetObservation`** (un row par fait observé par un scanner):

```prisma
enum ObservationKind {
  DISCOVERED          // l'asset apparaît pour la 1ère fois
  RESOLVED            // dnsx résout un subdomain en IPs
  PORT_OPEN           // naabu/nmap voit un port
  SERVICE_DETECTED    // nmap -sV fingerprint un service
  TECH_DETECTED       // httpx fingerprint
  HTTP_PROBED         // httpx statut/title/server
  DNS_RECORD          // dnsx A/AAAA/CNAME/MX/NS/TXT
  FINDING_RAISED      // nuclei émet un finding
}

model AssetObservation {
  id           String          @id @default(cuid())
  assetId      String
  scanJobId    String
  scannerName  String          // dénormalisé pour query rapide
  kind         ObservationKind
  observedAt   DateTime        @default(now())
  payload      Json?

  asset   Asset   @relation(fields: [assetId], references: [id], onDelete: Cascade)
  scanJob ScanJob @relation(fields: [scanJobId], references: [id], onDelete: Cascade)

  @@index([assetId, observedAt])
  @@index([scanJobId])
  @@index([kind])
  @@index([scannerName])
}
```

**Nouvelle table `CveCache`** (one row per CVE, PK = cveId):

```prisma
model CveCache {
  cveId        String         @id            // "CVE-2024-12345"
  cvssV3Score  Float?
  cvssV3Vector String?
  severity     Severity?                     // dérivée du score
  summary      String?        @db.Text
  references   String[]       @default([])
  publishedAt  DateTime?
  fetchedAt    DateTime       @default(now())
  expiresAt    DateTime                      // 30j si OK, 1h si ERROR
  fetchStatus  CveFetchStatus @default(OK)
  errorMessage String?

  @@index([expiresAt])
}

enum CveFetchStatus { OK, NOT_FOUND, RATE_LIMITED, ERROR }
```

**Pas de changement de schéma pour `riskScore`** — le champ `Asset.riskScore: Float @default(0)` existe et reste tel quel; étape 3.2 active simplement les écritures.

**Migration unique** `add_asset_observation_and_cve_cache`. Pas de backfill d'observations historiques (les engagements Phase 1/2 existants gardent leurs assets mais sans timeline rétroactive).

### 2.2 Formule `riskScore`

`libs/correlation/risk-score.ts` exporte une pure function:

```
score(asset) =
    findings_weight     // 10*CRITICAL + 5*HIGH + 2*MEDIUM + 0.5*LOW + 0*INFO  (somme sur findings non-soft-deleted)
  + sensitive_port_bonus // +2 par port parmi {22, 23, 445, 1433, 3306, 3389, 5432, 5900, 6379}
  + exposed_admin_bonus  // +3 si un Service.name|product contient un token parmi {admin, phpmyadmin, jenkins, kibana, grafana, prometheus}
  + cve_bonus            // +1 par finding avec cveId distinct
```

Recalculé en read-modify-write après chaque persist d'`AssetObservation` ou `Finding`. Idempotent: re-runner un parser sur le même raw output produit le même score.

### 2.3 Surfaces UI

Trois nouvelles surfaces, toutes consommées au niveau de l'engagement.

**Synthèse engagement** (route racine `/engagements/:id`) — layout 3 rangées:

- **Rangée 1:** `AttackSurfaceCounters` (domains, subdomains, IPs, openPorts, uniqueTechs) + `SeverityDonut` (distribution findings CRITICAL/HIGH/MEDIUM/LOW/INFO).
- **Rangée 2:** `TopFindingsList` (10 findings groupés par `dedupHash`, triés par severity × affectedAssetCount, badges scanner source + CVE) + `TopAssetsList` (10 assets triés par `riskScore DESC`, badges scanner sources).
- **Rangée 3:** `RecentTemplateRunsTimeline` (5 derniers runs, status, durée, delta newAssets/newFindings).

Chaque widget = 1 composant React + 1 query GraphQL indépendante. Pas de mega-query. L'EngagementPage actuelle (qui affiche les assets) devient un onglet `Assets` sous `Synthèse | Assets | Findings | Template Runs`.

**Assets list enrichie** (onglet `Assets`):

- Table existante augmentée d'une colonne `riskScore` (triable par défaut DESC).
- Panneau facettes vertical à gauche: kindCounts, severityCounts (asset a au moins 1 finding de cette sévérité), topTechs (top 20 par count), scannerSources.
- Tri additionnel: FIRST_SEEN_AT, LAST_SEEN_AT, CANONICAL_VALUE. Pagination conservée comme aujourd'hui.

**Asset Detail 360°** (route `/engagements/:eid/assets/:aid`):

- Header: canonicalValue + kind icon + riskScore badge + scanner sources badges + firstSeen/lastSeen.
- Onglets:
  - **Provenance:** liste verticale chronologique d'`AssetObservation` (groupée par jour, icône par `kind`, badge scanner, payload JSON expandable). 200 items max, "Show older" pour pagination.
  - **Réseau:** ports/services en table; si `kind=SUBDOMAIN`, table des IPs liées via `SubdomainIp`; si `kind=IP`, table des subdomains qui pointent dessus.
  - **Tech & DNS:** Technology rows + DnsRecord rows.
  - **Findings:** table Finding filtrée sur cet asset; chaque row peut être expandée pour voir CVE info (CVSS + summary depuis CveCache).

### 2.4 Live refresh

GraphQL subscription `engagementUpdated(engagementId): EngagementUpdateEvent { kind, assetId?, templateRunId?, ts }`.

- **Publishers:** `parser-worker` et `orchestrator-worker` publient sur Redis channel `engagement:<id>:updates` après chaque transition (asset added, riskScore changed, finding raised, observation added, template run status change, CVE enriched).
- **API resolver:** un seul subscriber Redis partagé (pattern Phase 2 existant `orchestrator-worker` — voir commit `12c636f`), dispatch par engagementId via Map.
- **Frontend:** `useSubscription(EngagementUpdated)` au niveau `EngagementPage`. Sur event, mapping `kind → refetchQueries[]` (ex: `ASSET_RISK_CHANGED → ['EngagementOverview', 'TopAssets', 'Assets']`).
- **Heartbeat de secours:** toutes les 30s, refresh des queries actives sans dépendre de la subscription. Filet contre pertes pub/sub.

### 2.5 CVE enrichment

Nouvelle app `apps/cve-enricher-worker/`:

- Consumer BullMQ sur queue `CVE_ENRICHMENT`.
- `jobId = cveId` → BullMQ dédupe nativement (stampede prevention).
- Pour chaque job: check `CveCache`; si miss ou `expiresAt < now`, hit NVD API 2.0 (`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=<id>`).
- Rate-limiter token bucket: 5/30s sans key, 50/30s avec `NVD_API_KEY`.
- Mapping `cvssV3Score` → `severity` (0-3.9 LOW, 4-6.9 MEDIUM, 7-8.9 HIGH, 9-10 CRITICAL).
- Sur succès: upsert `CveCache { expiresAt: now+30d, fetchStatus: OK }`, publish `engagement:<id>:updates` pour chaque engagement qui a un finding avec ce cveId.
- Sur 404: cache `{ fetchStatus: NOT_FOUND, expiresAt: now+30d }`.
- Sur 429/5xx/network: backoff exponentiel 1s→16s, max 5 retries; échec final → `{ fetchStatus: ERROR, expiresAt: now+1h }`.

**Enqueue path:** `parser-worker`, après chaque persist de `Finding` avec `cveId` non null, fait un `enrichQueue.add('enrich', { cveId }, { jobId: cveId })`. Idempotent.

**Read path:** GraphQL resolver `cveInfo(cveId)` lit `CveCache` direct; si absent ou expiré, enqueue un job (jobId=cveId) et retourne `{ cveId, cached: false }`. L'UI affiche un skeleton; à la fin du job, la subscription `CVE_ENRICHED` → refetch.

---

## 3. Séquencement en trois étapes

Approche "vertical slice + élargissement", cohérente avec Phase 1/2.

### 3.1 Étape 1 — Synthèse engagement avec données existantes (~5-7 jours)

**Objectif:** ship une page de synthèse utile en consommant uniquement les données déjà persistées par Phase 2. Pas de nouvelles tables, pas de riskScore, pas de subscription.

**Livrables:**

1. Nouveau lib `libs/insight/`: pure functions `getEngagementOverview`, `getTopFindings`, `getRecentTemplateRuns`. Aucune écriture, seulement lectures Prisma + agrégations.
2. Module GraphQL `InsightModule` dans `api-gateway` exposant les 3 queries + `topAssets` (bouchonné en 3.1: tri par `findings count DESC` puisque `riskScore` est toujours à 0).
3. Frontend: `EngagementPage` refactorée avec tabs `Synthèse | Assets | Findings | Template Runs`. Synthèse = nouvelle sous-arborescence `features/engagements/synthesis/`:
   - `engagement-synthesis-page.tsx` (orchestrateur)
   - `attack-surface-counters.tsx`
   - `severity-donut.tsx` (SVG pur ou recharts selon ce qui est déjà dans `package.json`)
   - `top-findings-list.tsx`
   - `top-assets-list.tsx`
   - `recent-runs-timeline.tsx`
4. Tests unitaires des pure functions `libs/insight/`. Test integration GraphQL avec un engagement seed.
5. Tests composant React (testing-library, pattern existant `__tests__`).

**Critère "done" 3.1:**

- `engagementOverview`, `topFindings`, `recentTemplateRuns`, `topAssets` retournent des valeurs cohérentes sur un engagement seed.
- Page `/engagements/:id` affiche les 3 rangées; les chiffres correspondent à ce qu'on voit dans l'onglet Assets.
- L'onglet `Assets` continue de marcher (non-régression).

**Acceptance manuelle:** lancer `recon-passive` sur un engagement neuf → la synthèse affiche counters non-nuls et un donut sévérité.

### 3.2 Étape 2 — riskScore + asset list scorée + asset detail (~5-7 jours)

**Objectif:** activer le score, brancher facettes + tri sur la liste, ouvrir la fiche asset.

**Livrables:**

1. `libs/correlation/risk-score.ts`: pure function `computeRiskScore` avec la formule §2.2. Tests unitaires couvrant chaque pondération et un cas combiné.
2. `apps/parser-worker`: après persist d'une `Finding` ou Port/Service, appel à `recomputeRiskScoreForAffectedAssets`. Transactionnel + retry une fois sur conflit.
3. Backfill one-shot (script `pnpm prisma:script recompute-risk-scores`) qui recalcule tous les assets existants; à exécuter manuellement après deploy.
4. Extension de la query `assets(engagementId, kinds?, search?, limit, offset)` existante (`apps/api-gateway/src/app/assets/unified-assets.resolver.ts`): ajoute `filters: AssetFilters` (severityHas, portRanges, techNames, scannerSources — les inputs existants `kinds`/`search` restent) et `sort: AssetSort` (RISK_SCORE par défaut DESC, sinon FIRST_SEEN_AT/LAST_SEEN_AT/CANONICAL_VALUE). Pagination `limit/offset` conservée. Nouvelle query `assetFacets(engagementId, filters)`.
5. Nouvelle query `asset(id): AssetDetail` (ports, services, technologies, dnsRecords, findings, ipAddresses, subdomains, observations=[] en 3.2).
6. Frontend:
   - `engagement-assets-tab.tsx`: colonne riskScore triable + panneau facettes à gauche.
   - Nouveau dossier `features/assets/`: `asset-detail-page.tsx`, `asset-header.tsx`, `asset-network-tab.tsx`, `asset-tech-tab.tsx`, `asset-findings-tab.tsx`, `asset-provenance-tab.tsx` (placeholder "Activé en 3.3").
   - Route `/engagements/:eid/assets/:aid` ajoutée à `app.tsx`.
   - `top-assets-list.tsx` (rangée 2 synthèse): clic sur un asset → asset detail.

**Critère "done" 3.2:**

- `Asset.riskScore` non-zéro pour les assets avec finding ou port sensible (test integration sur fixture nuclei).
- `assets()` accepte les filtres + sort; `assetFacets()` retourne des counts cohérents.
- Asset detail rend les 4 onglets (Provenance placeholder).
- Backfill script exécutable sans erreur sur un engagement seed.

**Régression à corriger:** tests Phase 1/2 qui assertent `riskScore: 0` → assouplir vers `riskScore: >=0` (grep `riskScore` dans `**/*.spec.ts`).

**Acceptance manuelle:** après `web-quick`, la Top assets list de la synthèse pointe vers les bons assets; clic → asset detail → Findings tab montre les bons findings.

### 3.3 Étape 3 — Provenance + Live refresh + NVD (~5-7 jours)

**Objectif:** ship la corrélation cross-tool visible et le temps réel.

**Livrables:**

1. Migration Prisma `add_asset_observation_and_cve_cache`.
2. `apps/parser-worker`: après chaque upsert (Subdomain/IpAddress/Port/Service/Technology/DnsRecord/Finding), écrit l'`AssetObservation` correspondante dans la même transaction. Mapping kind ↔ scanner dans `libs/correlation/observation-mapper.ts`.
3. `apps/cve-enricher-worker/`: nouveau process + Dockerfile + entrée `nx serve cve-enricher-worker`. Implémente le flow §2.5. Tests integration avec `nock` ou `msw` sur les 4 cas réseau.
4. `apps/parser-worker`: enqueue `CVE_ENRICHMENT` après persist d'un finding avec cveId.
5. GraphQL:
   - `AssetDetail.observations: [AssetObservation!]!` retourne maintenant les rows réelles.
   - Nouvelle query `cveInfo(cveId): CveInfo` avec read-through + enqueue lazy.
   - Subscription `engagementUpdated(engagementId): EngagementUpdateEvent` (kinds: ASSET_ADDED, ASSET_RISK_CHANGED, FINDING_RAISED, OBSERVATION_ADDED, TEMPLATE_RUN_STATUS_CHANGED, CVE_ENRICHED).
6. Publishers: `parser-worker` et `orchestrator-worker` publient sur `engagement:<id>:updates`. Subscriber Redis partagé côté `api-gateway` (pattern commit `12c636f`).
7. Frontend:
   - `asset-provenance-tab.tsx`: liste chronologique cross-scanner, 200 items + "Show older".
   - `engagement-page.tsx`: `useSubscription(EngagementUpdated)` + dispatcher `refetchQueries`. Heartbeat 30s en filet.
   - `top-findings-list.tsx` + `asset-findings-tab.tsx`: affichent CVSS + summary depuis `cveInfo`; skeleton si `cached: false`.
8. Test e2e `correlation-dashboard-e2e.spec.ts`: run `recon-active` sur engagement neuf → asset detail d'un subdomain découvert montre ≥3 entrées Provenance + finding avec cveId montre CVSS score (NVD mocké).

**Critère "done" 3.3:**

- Chaque scanner Phase 1+2 écrit ≥1 observation par persist (test integration par scanner).
- Onglet Provenance affiche timeline cross-scanner pour un asset touché par ≥2 scanners.
- `cve-enricher-worker` build & run; les 4 cas réseau couverts en test.
- Subscription émet sur les bons kinds.
- Live refresh observable: lancer un template-run sur un engagement ouvert, voir les counters bouger sans F5.

---

## 4. Gestion d'erreurs & résilience

### 4.1 NVD

- **Network / 5xx / timeout** → backoff exponentiel 1s→16s, max 5 retries. Final échec: `CveCache { fetchStatus: ERROR, expiresAt: now+1h }`. UI affiche cveId brut.
- **429** → respect `Retry-After` si présent, sinon backoff. Pas de consommation du retry budget.
- **404** → cache `{ fetchStatus: NOT_FOUND, expiresAt: now+30d }`.
- **Stampede prevention** via `jobId: cveId` BullMQ.
- **Sans `NVD_API_KEY`**: rate limit 5/30s, WARN log au boot.

### 4.2 Subscription dropouts

Redis pub/sub est at-most-once. Mitigations:

- Heartbeat frontend 30s qui refetch les queries actives (filet, pas mécanisme principal).
- Reconnexion Apollo sur WS drop → refetch global automatique.
- Pas de log d'événements rejouable v1 (trop cher pour le gain).

### 4.3 `riskScore` consistency

- Recompute dans transaction Prisma: `findUnique(include findings + ports.services)` → `computeRiskScore` → `update`. Optimistic locking via `updatedAt`.
- Conflit concurrent: retry une fois; sinon WARN log, score "presque juste" (un autre persist re-corrige).
- Pure function = re-runs idempotents, pas de drift.

### 4.4 `AssetObservation` volume

- Cap WARN à 10 000 observations par scanJob (continue à écrire — pas de drop silencieux).
- UI cap à 200 items par chargement de l'onglet Provenance + "Show older".

### 4.5 Asset soft-deleted

- `AssetObservation` reste valide (FK pas nullée par soft-delete).
- Asset detail d'un asset soft-deleted: banner "Supprimé le X" + read-only. Pas de redirect.

### 4.6 Ownership

- Toutes nouvelles queries/subscription passent par le `EngagementOwnership` guard existant.
- Subscription valide ownership au `subscribe` et à chaque event filtré côté resolver.

---

## 5. Tests

| Niveau | Cible |
|---|---|
| Unit | `computeRiskScore` (chaque pondération + edge cases score=0/max), `observation-mapper`, NVD response parsing |
| Lib integration | `libs/insight/` queries sur test DB |
| Worker integration | parser-worker fixture par scanner → Asset + Port + Observation + riskScore |
| API integration | resolvers `engagementOverview` / `asset(id)` / `cveInfo` + ownership guard |
| E2E env-gated | `correlation-dashboard-e2e.spec.ts` |
| Frontend | composants widgets + asset-detail tabs avec mock Apollo |

**NVD sans réseau:** `nock`/`msw` sur 200/404/429/500. Test optionnel `NVD_E2E=1` qui hit le vrai NVD (CVE-2014-0160 Heartbleed) pour sanity check.

**Régression Phase 1/2:** suites e2e existantes doivent rester vertes sans modification. Tests qui assertent `riskScore: 0` → assouplir.

---

## 6. Décisions architecturales clés

1. **Provenance par-fait via `AssetObservation` table dédiée** (pas par-asset minimaliste ni JSON dans metadata). Rationale: c'est l'élément qui transforme "tables côte à côte" en "histoire de l'engagement"; sans ça, le badge "vu par" reste superficiel. Coût: une nouvelle table + écriture systématique côté parser-worker.

2. **`riskScore` deterministe + facettes UI** (pas l'un ou l'autre). La synthèse a besoin d'un "top 10 risque" automatique; l'opérateur expérimenté veut aussi des facettes brutes. Le score sert d'ordre par défaut "intelligent" overridable.

3. **`cve-enricher-worker` comme nouveau process** (pas co-localisé dans parser-worker). Isole les latences NVD du flux de parsing. Coût: une app de plus à déployer.

4. **Subscription fan-out léger** (kind + IDs, pas payloads). Le front décide quoi refetch. Évite payloads géants dans Redis pub/sub.

5. **Une query par widget** (pas de mega-query). Trade-off conscient: plus de round-trips au load initial vs simplicité de refresh ciblé.

6. **Heartbeat 30s en filet** (Redis pub/sub at-most-once). Pas de log d'événements rejouable v1.

7. **Pas de backfill `AssetObservation` rétroactif** pour les engagements existants Phase 1/2. Les assets restent, sans timeline historique. Acceptable car `firstSeenAt`/`lastSeenAt` existent déjà.

8. **Vertical slice 3.1→3.2→3.3** (pas backend-first, pas big-bang). Chaque étape ship une valeur utilisateur visible. Permet d'arrêter ou pivoter après 3.1 ou 3.2.

---

## 7. Risques & mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Volume `AssetObservation` explose sur gros scans nuclei | M | M | WARN à 10k/scanJob, pagination UI 200 items, pas de hard limit |
| NVD down ou rate-limite agressif | M | L | `fetchStatus: ERROR` cached 1h, UI dégrade gracefully (cveId brut), `NVD_API_KEY` optionnel |
| Subscription drops sur déconnexions WS fréquentes | L | M | Heartbeat 30s, reconnexion Apollo auto, refetch global au reconnect |
| `riskScore` recompute conflict sous charge | L | L | Retry une fois, WARN log, formule idempotente |
| Mega-query temptation pendant l'implémentation | M | M | Spec impose 1 query/widget; review code Phase 3 garde-fou |
| Frontend tabs refactor casse les patterns Phase 2 existants | M | M | Étape 3.1 préserve l'onglet `Assets`; tests régression existants |
| Drift entre `computeRiskScore` côté worker et logique UI/tri | L | M | Score stocké sur Asset (single source of truth); UI lit, ne recalcule pas |

---

## 8. Annexes

### 8.1 Surface GraphQL — résumé

- **Queries nouvelles:** `engagementOverview`, `topFindings`, `topAssets`, `recentTemplateRuns`, `assetFacets`, `asset(id)`, `cveInfo`.
- **Queries étendues:** `assets` (ajout `filters`, `sort`).
- **Subscription nouvelle:** `engagementUpdated(engagementId): EngagementUpdateEvent` (kinds: ASSET_ADDED, ASSET_RISK_CHANGED, FINDING_RAISED, OBSERVATION_ADDED, TEMPLATE_RUN_STATUS_CHANGED, CVE_ENRICHED).
- **Aucune mutation nouvelle.** Tout est read-only côté frontend; les writes restent côté workers.

Le SDL complet (inputs/types) sera écrit pendant la phase d'implémentation; les noms et signatures ci-dessus font foi pour le plan.

### 8.2 Mapping `kind → refetchQueries` côté Apollo

| Event kind | Queries à refetch |
|---|---|
| `ASSET_ADDED` | `EngagementOverview`, `Assets`, `AssetFacets`, `TopAssets` |
| `ASSET_RISK_CHANGED` | `TopAssets`, `Assets`, `AssetDetail` (si page asset ouverte) |
| `FINDING_RAISED` | `EngagementOverview`, `TopFindings`, `AssetDetail`, `AssetFacets` |
| `OBSERVATION_ADDED` | `AssetDetail` (si page asset ouverte) |
| `TEMPLATE_RUN_STATUS_CHANGED` | `RecentTemplateRuns`, `EngagementOverview` |
| `CVE_ENRICHED` | `TopFindings`, `AssetDetail` |

### 8.3 Mapping scanner → `ObservationKind`

| Scanner | Persiste | Émet observations |
|---|---|---|
| `nmap` | Port, Service | `PORT_OPEN`, `SERVICE_DETECTED` |
| `subfinder` | Subdomain | `DISCOVERED` |
| `dnsx` | DnsRecord, SubdomainIp | `RESOLVED`, `DNS_RECORD` |
| `httpx` | Technology, Subdomain (HTTP fields) | `HTTP_PROBED`, `TECH_DETECTED` |
| `naabu` | Port | `PORT_OPEN` |
| `nuclei` | Finding | `FINDING_RAISED` |
