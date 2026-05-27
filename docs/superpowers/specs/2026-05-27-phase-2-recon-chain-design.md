# Phase 2 — Recon Chain (ProjectDiscovery) — Design

> **Date:** 2026-05-27
> **Statut:** Spec V1 — issue d'un brainstorm, en attente de revue avant `writing-plans`.
> **Cycle:** Brainstorming → **Spec (ce document)** → Plan d'implémentation → Code.
> **Spec maître:** `docs/superpowers/specs/2026-05-24-autoscanner-platform-design.md` §1 (Phase 2).

Ce document approfondit Phase 2 de la spec plateforme. Il définit l'architecture des nouveaux blocs introduits, le séquencement en trois étapes (slice vertical → élargissement → finitions), les risques, et les décisions à trancher avant écriture du plan d'implémentation détaillé.

---

## 1. Objectif et critère "done"

**Objectif:** dépasser le scan unitaire (Phase 1) pour atteindre la *recon chain*. Un opérateur lance UN scan sur `client.com`, le système enchaîne automatiquement: découverte de sous-domaines → résolution DNS → fingerprinting HTTP → port scan → vuln scan templates. À la fin, l'engagement contient des Domain/Subdomain/IpAddress/Port/Service/Technology/DnsRecord/Finding corrélés sur les bons assets (un seul `api.client.com` même découvert par plusieurs sources).

**Critère "done" Phase 2:**

1. Mutation GraphQL `runTemplate(engagementId, templateName, target)` lance le pipeline complet.
2. 5 scanners intégrés et runnables: `subfinder`, `dnsx`, `httpx`, `naabu`, `nuclei`.
3. 4 templates seedés exécutables: `recon-passive`, `recon-active`, `web-quick`, `web-deep`.
4. Le flux de données entre étapes est observable: chaque step = un `ScanJob`, status individuel, logs live via la subscription `scanJobLogs` existante.
5. Correlation v1: re-runner le même template sur la même cible n'ajoute pas de doublons (asset merge + finding dedup par hash).
6. Modèle complet en base (Domain, Subdomain, IpAddress, Technology, DnsRecord) + vue/projection `Asset` unifiée pour les queries génériques.
7. CI verte, suite e2e env-gated `recon-chain-e2e` étend l'existant Phase 1.

---

## 2. Architecture des trois nouveaux blocs

### 2.1 Orchestrator (ScanTemplate executor linéaire)

- Nouveau lib `@autoscanner/templates`: types `TemplateDefinition`, `TemplateStep` (`scannerName`, `inputs` qui combinent config statique et références au contexte sous forme `$context.subdomains`, `$context.targets`), `TemplateRegistry` injectable (même pattern que `ScannerRegistry`).
- Nouvelles tables Prisma:
  - `ScanTemplate` (catalogue versionné, seedé).
  - `TemplateRun` (instance d'exécution, parent du `Scan` Phase 1; champs: `id`, `templateName`, `engagementId`, `target`, `status`, `currentStepIndex`, `startedAt`, `completedAt`, `createdById`).
- Le `Scan` Phase 1 devient une `TemplateRun` à 1 étape (rétro-compat via un template synthétique `single-scanner-<name>`). Le `Scan.templateRunId` est nullable (Phase 1 existing rows restent valides).
- Nouvelle app `orchestrator-worker`: BullMQ consumer sur queue `TEMPLATE_RUNS`.
  - Pour chaque step: récupère le contexte (résultats persistés des steps précédents via query sur Asset/Subdomain/IpAddress), enqueue un `ScanJob` sur `SCAN_JOBS`, attend completion via Redis pub/sub `scanjob:done:<id>` (avec fallback polling DB pour résilience), passe au step suivant.
  - Échec d'un step = TemplateRun `FAILED`, steps suivants `SKIPPED`, steps déjà exécutés restent persistés.
  - `TemplateRun.currentStepIndex` persisté à chaque transition → reprise après crash worker.
- **Flux input/output entre steps via la DB.** L'orchestrator ne passe pas de blob en mémoire; chaque step lit ses inputs depuis l'état persisté de l'engagement. Cohérent avec "la plateforme est la source de vérité" et permet le resume from middle.

### 2.2 Modèle de données (tables dédiées + vue Asset unifiée)

- 5 nouvelles tables Prisma:
  - `Domain` (engagementId, value canonical, firstSeenAt, lastSeenAt).
  - `Subdomain` (engagementId, domainId FK, value canonical, httpStatus?, httpTitle?, httpServer?, firstSeenAt, lastSeenAt).
  - `IpAddress` (engagementId, value canonical, version IPv4|IPv6, firstSeenAt, lastSeenAt).
  - `Technology` (assetId FK générique, name, version?, source scannerName, firstSeenAt, lastSeenAt).
  - `DnsRecord` (subdomainId? OR domainId?, type enum A|AAAA|CNAME|MX|NS|TXT, name, value, ttl?, firstSeenAt, lastSeenAt).
- Table de jointure `SubdomainIp` (n:n: une CNAME chain produit plusieurs IPs; une IP héberge plusieurs subdomains).
- Évolution de l'`Asset` Phase 1: devient le pivot polymorphe.
  - Gagne `kind` enum (`HOST` | `DOMAIN` | `SUBDOMAIN` | `IP`).
  - Une FK nullable par kind (`domainId?`, `subdomainId?`, `ipAddressId?`) avec contrainte CHECK `kind` ↔ FK non-nulle correspondante.
  - Les champs communs (engagementId, firstSeenAt, lastSeenAt, riskScore, discoveredBy) restent sur `Asset`.
  - Migration: les `Asset` Phase 1 existants → `kind = HOST` (cas pré-nmap), pas de FK spécialisée.
- Vue Postgres `asset_unified_view` (non matérialisée d'abord) projette `Asset` LEFT JOIN Domain/Subdomain/IpAddress, schéma plat: `id, kind, engagementId, canonicalValue, displayName, firstSeenAt, lastSeenAt, riskScore, attrs (JSONB)`.
- Type GraphQL `UnifiedAsset` + query `assets(engagementId, kinds?, search?)` paginé. C'est ce que l'UI consomme pour les listes génériques.
- `Port`/`Service` restent rattachés à `Asset` (`kind = IP` ou `HOST`).

### 2.3 Correlation engine v1

- Lib `@autoscanner/correlation` (extraction du code inline qui aura émergé en Étape 1, voir §3).
- Invoquée par `parser-worker` après persistance brute.
- Deux opérations atomiques:
  - **Asset merge**: après upsert d'un asset, détecte les doublons par clé canonique `(engagementId, kind, canonical_value)` et merge → un seul row, `Asset.discoveredBy` (string[]) accumule les scanners qui l'ont vu.
  - **Finding dedup**: `dedupHash = sha256(scannerName + templateId + assetCanonical + locationCanonical + signature)` où `signature` = CVE id, tag nuclei, ou nom de la règle. Re-run incrémente `lastSeenAt` au lieu de créer une nouvelle ligne.
- Canonicalisation:
  - Domains/subdomains: lowercase, trim, retrait du trailing dot, IDN → punycode.
  - IPs: IPv4 dotted; IPv6 forme compressée (single `::`).
- Pas de cross-scanner intelligence en v1 (réservé Phase 4: ex. déduire qu'un finding nuclei et un finding nikto pointent sur la même vuln). Juste dédup exact + asset merge par valeur canonique.

---

## 3. Séquencement en trois étapes

L'approche retenue est "vertical slice + élargissement": livrer un slice end-to-end minimal d'abord (Étape 1), puis élargir scanners par scanner (Étape 2), puis finitions et durcissement (Étape 3). Justification: Phase 1 a livré un slice nmap vertical qui a fait émerger les bonnes abstractions; rejouer le même pattern donne le meilleur ratio apprentissage/risque.

### 3.1 Étape 1 — Slice end-to-end minimal (~5-7 jours)

**Objectif:** valider l'orchestrateur, le modèle, et la correlation sur le sous-ensemble le plus minimal possible — un template `recon-passive` à 2 steps qui marche bout en bout.

**Livrables:**

1. Migration Prisma: `Domain`, `Subdomain`, `SubdomainIp` (placeholder), `ScanTemplate`, `TemplateRun`. Étend `Asset` avec `kind` enum + FK nullables Domain/Subdomain. Migration manuelle: `Asset` Phase 1 existants → `kind=HOST`.
2. Lib `@autoscanner/templates`: types + `TemplateRegistry`.
3. Scanner subfinder: lib `libs/scanners/subfinder/`, image `projectdiscovery/subfinder`, output JSON lines, Zod input (`domain`, optionnels `sources`, `timeout`).
4. Parser subfinder-json: lib `libs/parsers/src/subfinder-json/`, produit `NormalizedOutput` avec subdomains; `PersistService` upsert Domain + Subdomains.
5. Scanner httpx: lib `libs/scanners/httpx/`, image `projectdiscovery/httpx`, input = liste de targets, output JSON `{url, status_code, title, tech, server, content_length}`.
6. Parser httpx-json: upsert Technology liées au Subdomain, met à jour `Subdomain.httpStatus/httpTitle/httpServer`.
7. App `orchestrator-worker`: BullMQ consumer `TEMPLATE_RUNS`. Pour `recon-passive` (subfinder → httpx): crée TemplateRun, enqueue step 1 SCAN_JOBS avec target = domain, attend `scanjob:done:<id>`, lance step 2 avec targets = subdomains du Domain (query DB; fallback au domain racine si zéro subdomain — voir D3), attend, marque TemplateRun `COMPLETED`.
8. Correlation v1 minimal (inline dans parser-worker, sera extrait en Étape 3): `mergeAssets(engagementId)` canonicalise et merge les Subdomain doublons.
9. GraphQL mutation `runTemplate(engagementId, templateName, target)` → crée TemplateRun, enqueue, retourne `id`. Query `templateRun(id)` → status + steps + assets découverts.
10. Frontend: page engagement gagne un bouton "Run recon-passive" (input domain), navigue vers `/template-runs/<id>` qui affiche les steps en accordéon (chacun avec logs live via la subscription existante).
11. Seed: `pnpm seed` ajoute le template `recon-passive`.

**Acceptance (e2e env-gated `recon-passive-e2e`):**
Lancer `recon-passive` sur `hackerone.com` → ≥5 Subdomains insérés, ≥1 Technology, TemplateRun `COMPLETED`. Re-lancer → 0 nouveau Subdomain inséré (merge fonctionne), `lastSeenAt` actualisé.

**Risque principal:** la coordination "step 1 complete → query DB → step 2 start" via pub/sub demande un protocole précis (timeout, gestion du cas worker crash entre steps). Mitigation: polling DB en fallback du pub/sub, retry idempotent (`TemplateRun.currentStepIndex` tracking).

### 3.2 Étape 2 — Élargissement scanners (~5-7 jours)

**Objectif:** plugger les 3 scanners restants (dnsx, naabu, nuclei) sur l'orchestrateur de l'Étape 1, étendre le modèle au fur et à mesure, *sans refacto majeure*.

1. **Scanner + parser dnsx** (~1.5 jour):
   - Lib `libs/scanners/dnsx/`, image `projectdiscovery/dnsx`, input = liste de subdomains, output JSON avec IPs + record types (A, AAAA, CNAME, MX, NS, TXT).
   - Migration: `DnsRecord`, `IpAddress`, étend `Asset.kind` avec `IP`, peuple `SubdomainIp`.
   - Parser: upsert IpAddress (canonical), insère DnsRecord, peuple SubdomainIp.
   - Crée template `recon-active` = subfinder → dnsx → httpx.
2. **Scanner + parser naabu** (~1.5 jour):
   - Lib `libs/scanners/naabu/`, image `projectdiscovery/naabu`, input = liste d'IPs, output JSON `{ip, port, protocol}`.
   - Ré-utilise `Port` Phase 1 (rattachée à un Asset `kind=IP`). Service laissé vide (naabu ≠ service detection).
   - Étend `recon-active` à 4 steps; crée `web-quick` = httpx → naabu.
3. **Scanner + parser nuclei** (~2 jours):
   - Lib `libs/scanners/nuclei/`, image `projectdiscovery/nuclei`. Input = liste d'URLs (contexte httpx) + optionnels `severity`, `tags`, `templates`. Output JSON Lines.
   - Map nuclei output → Finding (`title=template-id`, `severity`, `templateId`, `location=matched-at`, `evidence`).
   - Le `dedupHash` devient critique (nuclei peut produire 100+ findings par run).
   - Crée `web-deep` = subfinder → dnsx → httpx → naabu → nuclei.
4. **Frontend** (~1 jour): la page TemplateRun gère N steps (déjà fait Étape 1); ajoute une vue engagement listant les assets par kind (Domains | Subdomains | IPs | Technologies | Findings) avec tab Findings + filtre sévérité.
5. **Seed templates**: ajoute `recon-active`, `web-quick`, `web-deep`.

**Acceptance (e2e env-gated `web-deep-e2e`):**
Lancer `web-deep` sur `hackerone.com` → toutes tables peuplées (Domain, Subdomains, IPs, DnsRecords, Ports, Technologies, Findings). Re-run → 0 doublon, `lastSeenAt` actualisé partout.

**Risque principal:** nuclei génère beaucoup de données et son output évolue. Mitigation: figer la version d'image (`projectdiscovery/nuclei:vX.Y`), parser tolérant (Zod `.passthrough()` + warning sur unknown fields).

### 3.3 Étape 3 — Correlation v1 complet + finitions (~3-5 jours)

**Objectif:** durcir ce qui a été assemblé sur le tas, livrer la vue unifiée, compléter le correlation v1, finaliser docs et CI.

1. **Vue `asset_unified_view`** (~1 jour):
   - Migration: create view (raw SQL via `prisma db execute`) projetant Asset LEFT JOIN Domain/Subdomain/IpAddress, schéma plat avec `attrs` JSONB pour les champs kind-spécifiques.
   - Type GraphQL `UnifiedAsset` + query `assets(engagementId, kinds?, search?)` paginé.
   - Démarrage en vue non matérialisée. Bascule matérialisée (avec refresh on write) différée jusqu'à preuve de bottleneck perf (>10k assets).
2. **Correlation v1 — finalisation** (~1.5 jour):
   - Extrait `libs/correlation/` (jusqu'ici inline parser-worker).
   - Asset merge robuste: canonical normalization (lowercase, trim, IDN punycode, IPv6 compressed), `Asset.discoveredBy: string[]` track multi-source.
   - Finding dedup robuste: `dedupHash` documenté, déterministe, tests fixtures cross-scanner.
   - Cross-step linking: après run du template, passe finale qui rattache les orphelins (ex: Port sans owner clair → IpAddress via SubdomainIp).
   - Tests unitaires sur canonicalisation, idempotence, ordre indépendant.
3. **CLI** (~0.5 jour):
   - `autoscanner template list` → 4 templates seedés.
   - `autoscanner template run --engagement <id> --template recon-passive --target client.com` → suit le run, progress par step.
4. **Robustesse orchestrator** (~1 jour):
   - Step échoue → TemplateRun `FAILED`, suivants `SKIPPED`, assets persistés conservés.
   - `cancelTemplateRun(id)` propage `scanjob:cancel:<id>` aux steps en cours, marque les pending `CANCELLED`.
   - Timeout global par template (override possible, défaut 2h).
   - Test resilience: tuer orchestrator-worker entre step 2 et 3 → restart reprend (lecture `TemplateRun.currentStepIndex`).
5. **Docs + readme** (~0.5 jour):
   - README: section Phase 2, schéma de flux du template engine, liste des templates, exemples CLI.
   - Le plan d'implémentation produit par `writing-plans` sera commit à `docs/superpowers/plans/2026-MM-DD-phase-2-recon-chain.md`.
6. **CI** (~0.5 jour):
   - Ajoute `orchestrator-worker` aux services boot pour les e2e.
   - Pre-pull les 5 images Docker au début du job (cache layer).
   - Suite `recon-chain-e2e` (combine les e2e des 3 étapes) tourne en matrix séparée.

**Acceptance Étape 3 (et Phase 2 complète):**
Tous les critères "done" §1 sont verts. `pnpm nx test correlation` couvre canonicalisation + dedup + merge avec fixtures cross-scanner. `pnpm nx e2e recon-chain-e2e` (env-gated) lance les 3 templates séquentiellement sur la même cible et vérifie l'absence de doublons inter-templates.

---

## 4. Risques

Par ordre de criticité:

1. **Coordination inter-steps via Redis pub/sub fragile**. Si l'orchestrator-worker crash entre la réception de `scanjob:done:<id>` et l'enqueue du suivant, la TemplateRun reste bloquée. *Mitigation:* `TemplateRun.currentStepIndex` persisté + reconciliation au boot (scan des `RUNNING`, vérif état des steps en DB, reprise). La queue, c'est la table.
2. **Output volumes nuclei** (un `web-deep` sur grand domaine = 500+ findings, plusieurs MB par step). *Mitigation:* stream raw outputs vers MinIO en chunks (Phase 1 déjà en place), parser en streaming JSON Lines (pas tout en mémoire).
3. **Canonicalisation imparfaite** → doublons silencieux. Ex: `www.client.com` vs `client.com`, IPv4-mapped IPv6, IDN. *Mitigation:* tests dédiés (`canonical.spec.ts`) + property-based testing (fast-check) sur invariants (idempotence, ordre indépendant).
4. **Scope creep des scanners actifs**. Naabu/nuclei/dnsx font du trafic sortant; sur une cible mal configurée le scan peut "déborder". *Mitigation:* la validation GraphQL `ScopeRule` Phase 1 reste première ligne; l'orchestrator re-valide à chaque step (asset découvert par N-1 doit être in-scope avant que N le scanne).
5. **Dérive de schéma des sorties ProjectDiscovery**. Les outils évoluent vite, JSON keys peuvent muter. *Mitigation:* parser tolérant (Zod `.passthrough()`, log warning sur unknown fields, no crash), CI pin les versions d'images.

---

## 5. Décisions ouvertes

À trancher avant écriture du plan d'implémentation (`writing-plans`).

- **D1 — Worker dédié `orchestrator-worker` ou rôle dans `api-gateway` ?** Recommandation: worker dédié (cohérent avec scan/parser-worker, isole la logique state-machine).
- **D2 — Naabu vs nmap pour le port scan dans le pipeline web ?** Naabu plus rapide mais moins riche. Recommandation: naabu dans `web-deep` (vitesse); nmap reste accessible en standalone Phase 1. Pas de pipeline nmap en Phase 2.
- **D3 — Subfinder zéro résultat → comportement ?** Recommandation: continuer avec target = domain racine (httpx peut opérer dessus). Zéro résultat n'est pas une condition d'échec.
- **D4 — Granularité cancellation ?** Recommandation: cancel seulement le step en cours; les suivants ne sont enqueued qu'après completion du précédent dans le model linéaire.
- **D5 — Frontend: graphe visuel des steps ou liste séquentielle ?** Recommandation: liste séquentielle Phase 2 (cohérent avec pipeline linéaire); graphe différé en Phase 3 quand on aura les DAG.

---

## 6. Plan de tests

- **Unit** par lib: `templates` (registry + définitions), `correlation` (canonicalisation, hash, merge), chaque parser (fixtures JSON commitées, capturées une fois sur `hackerone.com`).
- **Integration** par worker: `orchestrator-worker.e2e-spec.ts` avec mock scanner (no Docker), valide la state machine TemplateRun (`RUNNING` → step transitions → `COMPLETED` | `FAILED` | `CANCELLED`).
- **E2E env-gated** (étend `apps/api-gateway-e2e/`):
  - `recon-passive-e2e.spec.ts` (Étape 1).
  - `web-deep-e2e.spec.ts` (Étape 2).
  - `recon-chain-e2e.spec.ts` (Étape 3, full matrix).
  - Mêmes env vars que Phase 1 (`E2E_API_URL`, `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_TARGET`), skip si absentes.
- **CI**: ajoute `orchestrator-worker` au workflow, pre-pull les 5 images dans une step cache, suite `recon-chain-e2e` en matrix séparée du build/unit.

---

## 7. Hors-scope Phase 2 (rappel)

Explicitement reportés à Phase 3+:

- DAG / graphe d'exécution multi-parents.
- Cross-scanner finding correlation (déduire que deux scanners pointent la même vuln).
- Vue `asset_unified_view` matérialisée.
- Graphe visuel des steps dans le frontend.
- Risk scoring v2 et mapping CVE depuis CPE (Phase 4).
- Scheduler / agent distribué (Phase 5).
