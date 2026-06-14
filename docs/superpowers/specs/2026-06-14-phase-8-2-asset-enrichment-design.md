# Phase 8.2 — Asset Enrichment — Design

> **Date:** 2026-06-14
> **Statut:** Spec V1 — issue du brainstorming (axe « enrichissement par asset »). En attente de revue avant `writing-plans`.
> **Cycle:** Brainstorming (fait) → **Spec (ce document)** → Plan 8.2 → Code.
> **Parent:** Phase 8 « Recon expansion v2 ». 8.1 (surface passive) livrée. **8.2 = enrichissement.** Screenshots déplacés en **8.2b** (nécessitent une capture d'artefact binaire dans le scan-worker — design dédié).
> **Précédent de référence:** Phase 8.1 (`docs/superpowers/specs/2026-06-14-phase-8-1-passive-surface-design.md`) — même patron d'ajout de scanners.

---

## 1. Objectif et critère « done »

**Objectif:** approfondir les informations sur les assets web **déjà découverts** — détecter le WAF devant un host, identifier si une IP est derrière un CDN/cloud, extraire les endpoints cachés et secrets dans le JavaScript, et empreindre le favicon (pivot/identification techno).

**Approche (A — réutilisation maximale, comme 8.1):** chaque outil = `ScannerDefinition` Docker-sandboxé standard ; **toute la sortie est mappée sur des entités existantes** (`Technology`, `Endpoint`, `Finding`). **Aucun changement Prisma, aucun enum, aucune migration.** Aucun changement front (onglets Technologies/Endpoints/Findings existants).

**Critère « done » 8.2:**
1. 4 nouveaux scanners enregistrés dans `AllScannersModule`, exécutables standalone + en template : `favicon`, `wafw00f`, `cdncheck`, `js-recon`.
2. Chaque scanner: lib `libs/scanners/<tool>` (ScannerDefinition + module auto-register), parser sous `libs/parsers/src/<tool>-<fmt>` enregistré dans `ParsersModule`, tests unitaires (build cmd + parser).
3. Dockerfiles pour `wafw00f`, `cdncheck`, `js-recon`. **`favicon` réutilise l'image httpx existante** (`autoscanner/httpx:1.0`) — pas de nouveau Dockerfile.
4. Template `web-enrich` qui enchaîne les 4 outils sur les hosts web.
5. Les données enrichies apparaissent dans les onglets existants (Technologies, Endpoints, Findings) **sans changement front**.
6. CI verte: lint + type-check + test sur les nouveaux projets ; e2e opt-in `WEB_ENRICH_E2E` ; **builds inclus** (leçon Phase 5).

**Non-buts (hors-scope 8.2):**
- **Screenshots web (gowitness)** → sous-phase **8.2b** (capture binaire scan-worker + stockage PNG + URL presignée + vignette UI).
- Corrélation par hash de favicon entre engagements / recherche Shodan favicon — la donnée est stockée ; l'exploitation est une évolution.
- Désobfuscation JS avancée / analyse de dépendances — extraction regex/linkfinder simple en V1.

---

## 2. Les 4 scanners

Patron commun identique à 8.1 (réf. `libs/scanners/asnmap`, `libs/scanners/crtsh`). `target` interpolé dans un shell → quoté (`shellQuoteSingle`).

| # | Scanner | Outil / image | Clé | Entité(s) | Notes |
|---|---|---|---|---|---|
| 1 | **favicon** | httpx `-favicon` (**réutilise** `autoscanner/httpx:1.0`) | — | `Technology` (`name: 'favicon-hash:<mmh3>'`, `categories:['favicon']`) | Empreinte mmh3 du favicon par host. Parser `favicon-json`. |
| 2 | **wafw00f** | wafw00f (Python) | — | `Technology` (`name: 'WAF: <produit>'`, `categories:['waf']`) | Détecte le WAF/firewall applicatif devant le host. JSON. |
| 3 | **cdncheck** | cdncheck (ProjectDiscovery, Go) | — | `Technology` (`name: 'CDN: <provider>'`, `categories:['cdn']`) | Flag CDN/cloud/WAF par IP/host. JSONL. |
| 4 | **js-recon** | subjs + linkfinder (+ regex secrets) | — | `Endpoint` (endpoints extraits du JS) + `Finding` (secrets/clés exposés, sévérité MEDIUM/HIGH) | Lit le contenu des fichiers JS du host. JSON. |

**Mapping → persisters existants** (parser-worker, inchangés): `Technology` → `TechnologyPersister` ; `Endpoint` → `EndpointPersister` ; `Finding` → `FindingPersister`. `NormalizedTechnology = { assetValue, name, version?, categories? }`, `NormalizedEndpoint = { url, method?, statusCode?, contentLength? }`, `NormalizedFinding = { scannerName, title, severity, location?, ... }` (déjà définis dans `libs/parsers/src/types.ts`).

---

## 3. Architecture & flux

```
runTemplate(web-enrich, target) → orchestrator enchaîne:
  favicon(host)   → ScanJob → JSON  → favicon-json   → Technology
  wafw00f(host)   → ScanJob → JSON  → wafw00f-json    → Technology
  cdncheck(host)  → ScanJob → JSONL → cdncheck-json   → Technology
  js-recon(host)  → ScanJob → JSON  → js-recon-json   → Endpoint + Finding
  → parser-worker → persisters existants → Technology/Endpoint/Finding
  → corrélation + risk-score (pipeline existant, inchangé)
```

- **Exécution:** scan-worker existant, aucun changement (tous les outils écrivent sur stdout en texte/JSON — pas d'artefact binaire ; c'est précisément pourquoi les screenshots sont hors-scope).
- **Pas de credential** pour les 4 (tous fonctionnent sans clé API).
- **Parsers:** un par outil sous `libs/parsers/src/<tool>-<fmt>`, enregistré dans `ParsersModule`, tolérant (jamais d'exception ; `emptyNormalizedOutput()` sur entrée vide/illisible).

---

## 4. Validation & tests

- **Unitaire (par scanner):** `build()` construit la bonne `cmd` + quote le `target` (test d'injection `a.com; rm -rf /`) ; le parser transforme une fixture réelle en entités attendues (1 happy + 1 vide/dégénéré).
- **Persisters:** réutilisés tels quels.
- **e2e opt-in** `WEB_ENRICH_E2E=1` : runTemplate `web-enrich` sur un host de test → vérifier ≥1 `Technology` favicon (favicon sans clé = assertion fiable) ; WAF/CDN/JS en assertions souples.
- **CI:** `nx run-many -t lint,type-check,test` sur les 4 libs scanners + 4 parsers + api-gateway/parser-worker/templates ; **+ `nx build`** des apps.

---

## 5. Sécurité & boundaries

- **Actif léger:** favicon/wafw00f/cdncheck/js-recon **contactent le host cible** (requêtes HTTP) — c'est de l'enrichissement actif non intrusif (comme httpx/katana existants), pas du passif. (À documenter dans la description de chaque scanner.) Reste dans le scope d'un engagement avec scope défini.
- **Anti-injection shell:** `target` quoté (`shellQuoteSingle`).
- **Sandbox Docker:** limites mém/CPU/timeout par scanner ; `network: bridge` ; `readonlyRootfs` si l'outil le permet.
- **js-recon — DoS/abus:** plafonner le nombre de fichiers JS téléchargés + taille par fichier (timeout + `|| true`) pour ne pas se faire piéger par un host hostile servant des JS énormes.

---

## 6. Découpage indicatif (pour le plan)

T1 favicon (scanner réutilisant l'image httpx + parser `favicon-json` → Technology) ; T2 wafw00f ; T3 cdncheck ; T4 js-recon (Endpoint+Finding) ; T5 Dockerfiles (wafw00f, cdncheck, js-recon) ; T6 register `AllScannersModule` + template `web-enrich` ; T7 e2e + validation.

---

## 7. Auto-revue

- **Couverture:** 4 thèmes choisis → 4 scanners (§2) ; zéro changement Prisma (Technology/Endpoint/Finding existent) ; mapping entités existantes ; tests + e2e (§4). ✅
- **Cohérence:** favicon réutilise l'image httpx (pas de Dockerfile en double) ; pas de credential ; pas d'enum. Plus léger que 8.1.
- **Ambiguïté levée:** screenshots explicitement déplacés en 8.2b (capture binaire requise). « js-recon » = un scanner composite (subjs→linkfinder+regex) produisant Endpoint+Finding. WAF/CDN/favicon → `Technology` avec un préfixe de `name` distinct (`WAF:`/`CDN:`/`favicon-hash:`) + `categories` pour les distinguer dans l'UI.
- **Scope:** focalisé, un seul plan. 8.2b (screenshots), 8.3, 8.4 restent des specs séparées.
