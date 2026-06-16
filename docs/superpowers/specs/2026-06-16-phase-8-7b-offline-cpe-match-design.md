# Phase 8.7b — Offline CPE→CVE Match Engine + Discovery Wiring — Design

> **Date:** 2026-06-16
> **Statut:** Spec V1 — validée en brainstorming (option « best »). En attente de revue avant `writing-plans`.
> **Parent:** Phase 8.7 = mirror NVD offline. **8.7a** (données + sync) livrée. **8.7b = moteur de match offline + branchement discovery** (cette spec) — exploite les tables `NvdCve`/`NvdConfigNode`/`NvdCpeMatch` de la 8.7a.
> **Choix produit assumé:** « la meilleure solution » — comparateur de versions robuste (pas du semver naïf), gestion **conservatrice** des nœuds AND (zéro faux positif fabriqué), et règle « mirror prêt = autoritatif, fallback live uniquement si pas encore synchronisé ».

---

## 1. Objectif et critère « done »

**Objectif:** résoudre `cpe → CVE applicables` **hors-ligne** depuis le mirror NVD local (8.7a), en évaluant correctement les **plages de versions** et la logique de nœuds **AND/OR/negate**, et brancher le `CveDiscoveryProcessor` (8.6) sur ce résolveur (fallback API live tant que le mirror n'est pas synchronisé).

**Critère « done » 8.7b:**
1. **Comparateur de versions** `libs/cve/src/cpe-version.ts` — `compareCpeVersions(a, b): -1 | 0 | 1`, pur, fortement testé (segments numériques/alpha ; gère `1.0.1` vs `1.0.1a`, `2.0` vs `2.0.0`, `2.0-rc1` < `2.0`, etc.).
2. **Moteur de match pur** `libs/cve/src/cpe-matcher.ts` — `parseCpe`, `cpeMatchApplies(target, match)` (vendor+product + version exacte OU plages start/end including/excluding), `evaluateNode(node, target)` (OR/AND conservateur + negate), `cveApplies(nodes, target)` (au moins un nœud applicable). **Aucune dépendance Prisma/réseau.**
3. **Résolveur** `apps/cve-enricher-worker/src/app/cpe-cve-resolver.service.ts` — `resolve(cpe): Promise<CpeCveMatch[]>` : mirror-first si `NvdSyncState.fullSyncCompletedAt` posé, sinon fallback `NvdClient.findCvesByCpe` (live).
4. **Branchement discovery** — `CveDiscoveryProcessor` appelle `resolver.resolve(cpe)` au lieu de `nvd.findCvesByCpe(cpe)` ; tout l'aval (`CpeCveCache`, création de Finding, enrichissement, recompute risque) inchangé.
5. Tests unitaires : comparateur (large table de cas), matcher (exact/range/AND/OR/negate/cross-product), résolveur (mirror-ready → matcher ; mirror non prêt → live ; mirror 0 → pas de fallback), discovery branché. **Aucun réseau/DB réel en test** (mock).
6. CI verte incl. `nx build`. Aucun changement front.

**Non-buts (hors-scope 8.7b):**
- Modifier le sync 8.7a (tables/worker inchangés — on lit seulement).
- **Distinction front « vérifié vs inféré »** (la donnée `evidence.inferred` existe déjà ; l'UI = phase future).
- **Enrichissement du dictionnaire CPE** (titres/produits) — on matche sur vendor:product:version des `cpeMatch` portés par les CVE.
- **Reconstruction CPE** quand le service n'a pas de CPE (déjà géré en 8.6 : pas de CPE → pas de discovery).
- Comparateur « parfait » couvrant tout schéma de version exotique (epoch debian, etc.) — on couvre solidement les cas courants + tests ; les cas pathologiques tombent en « non applicable » (conservateur), jamais en faux positif.

---

## 2. Composants & responsabilités

### 2.1 `compareCpeVersions(a, b)` (`libs/cve/src/cpe-version.ts`)
Pur. Découpe `a`/`b` en segments sur `.`, `-`, `_`, `+`. Compare segment par segment : deux segments numériques → comparaison numérique ; sinon comparaison lexicographique (insensible à la casse) ; un suffixe alpha sur une version par ailleurs égale la rend **inférieure** au préfixe pur seulement pour les pré-releases connus (`rc`, `alpha`, `beta`, `pre`) — sinon `1.0.1a` > `1.0.1` (révision). À segments inégaux, le côté le plus court avec préfixe égal est **inférieur** (`2.0` < `2.0.1`), sauf segments de padding `0` (`2.0` == `2.0.0`). Retour `-1|0|1`. Documenté + cas limites testés.

### 2.2 `cpe-matcher.ts` (`libs/cve/src/cpe-matcher.ts`) — pur
- `parseCpe(cpe): { vendor: string; product: string; version: string }` — split `cpe:2.3:<part>:<vendor>:<product>:<version>:...` ; `version` = parts[5] (`'*'`/`'-'` = non pinné).
- `interface MatchCriterion { criteria; vulnerable; versionStartIncluding?; versionStartExcluding?; versionEndIncluding?; versionEndExcluding? }` (= forme `NvdCpeMatch`).
- `cpeMatchApplies(target: ParsedCpe, m: MatchCriterion): boolean` — vendor+product du `m.criteria` == cible (sinon false) ; puis : si `m.criteria` pin une version concrète (≠ `*`/`-`) → `compareCpeVersions(target.version, critVersion) === 0` ; sinon appliquer les bornes présentes (`>= start`/`> start`/`<= end`/`< end`) via le comparateur ; si la cible n'a pas de version exploitable (`*`) et qu'il y a des bornes → non applicable (conservateur).
- `interface ConfigNode { operator: 'AND'|'OR'; negate: boolean; matches: MatchCriterion[] }`.
- `evaluateNode(node, target): boolean` — OR : un `vulnerable` match applicable ⇒ true ; AND : true **uniquement si** tous les `vulnerable` matches du nœud partagent le product de la cible **et** s'appliquent (si le nœud contient une condition `vulnerable` sur un product différent ⇒ non confirmable ⇒ false) ; `negate` inverse le résultat.
- `cveApplies(nodes: ConfigNode[], target): boolean` — au moins un nœud `evaluateNode` true.

### 2.3 `CpeCveResolver` (`apps/cve-enricher-worker/src/app/cpe-cve-resolver.service.ts`)
Injectable (`PrismaService`, `NvdClient`). `async resolve(cpe: string): Promise<CpeCveMatch[]>` :
```
state = prisma.nvdSyncState.findUnique({ where: { id: 'singleton' } })
si !state?.fullSyncCompletedAt → return nvd.findCvesByCpe(cpe)   // mirror pas prêt → live
target = parseCpe(cpe)
rows = prisma.nvdCpeMatch.findMany({
  where: { cpeVendor: target.vendor, cpeProduct: target.product },
  select: { criteria, vulnerable, version*…, node: { select: { id, operator, negate, cveId } } },
})
// regrouper par cveId → par node ; pour chaque cve, cveApplies(nodes, target) ?
// pour les cve applicables : charger cvssV3Score depuis NvdCve (findMany where cveId in [...])
return distinct [{ cveId, cvssScore }]
```
Mirror prêt + 0 résultat ⇒ retourne `[]` (autoritatif, **pas** de fallback live). Erreur DB ⇒ propage (le processor échoue proprement comme aujourd'hui). Logge la source (mirror/live).

### 2.4 Branchement `CveDiscoveryProcessor`
Injecter `CpeCveResolver` ; remplacer l'unique appel `this.nvd.findCvesByCpe(cpe)` (chemin cache-miss) par `this.resolver.resolve(cpe)`. Le reste (cache `CpeCveCache`, dedup finding, enrichissement, recompute) **inchangé**. `CpeCveResolver` enregistré dans `app.module.ts` providers.

---

## 3. Flux

```
CveDiscoveryProcessor.process({cpe,...}) :
  CpeCveCache frais ? → utilise
  sinon → resolver.resolve(cpe) :
            mirror prêt (fullSyncCompletedAt) ?
              oui → NvdCpeMatch by (vendor,product) → cpe-matcher (versions+AND/OR/negate) → {cveId,cvssScore}[]
              non → nvd.findCvesByCpe(cpe)   (live, comme 8.6)
          → écrit CpeCveCache, crée Findings inférés, enqueue CVE_ENRICHMENT, recompute risque  (inchangé)
```

## 4. Validation & tests
- **Comparateur:** table de cas (`1.0` vs `1.0.0` = 0 ; `1.2` < `1.10` ; `1.0.1` < `1.0.1a` ; `2.0-rc1` < `2.0` ; `1.0` < `1.0.1` ; égalité ; alpha vs num).
- **Matcher:** exact-version match ; range inclusif/exclusif (start/end) ; cible hors-range ; vendor/product différent → false ; cible sans version + bornes → false ; nœud OR (un match) ; nœud AND même-product (tous) ; nœud AND cross-product → false ; `negate`.
- **Résolveur:** mirror non prêt → appelle `nvd.findCvesByCpe`, n'interroge pas `NvdCpeMatch` ; mirror prêt → interroge `NvdCpeMatch` + matcher, ne touche pas le live ; mirror prêt + 0 row → `[]` sans fallback ; agrège les scores depuis `NvdCve`. (Prisma + NvdClient mockés.)
- **Discovery:** appelle `resolver.resolve` au lieu de `nvd.findCvesByCpe` ; aval inchangé (les tests 8.6 existants restent verts, adaptés au mock résolveur).
- **CI:** lint/type-check/test sur `cve`, `cve-enricher-worker` (+ leurs dépendances) + `nx build`. Jamais de réseau/DB réel.

## 5. Sécurité & boundaries
- **Hors-ligne par défaut** une fois le mirror synchronisé : zéro appel réseau pour la résolution (perf + pas de rate-limit). Fallback live borné au cas « mirror pas encore prêt ».
- **Pas d'injection** : `cpe` vient de la détection de service ; requêtes Prisma paramétrées.
- **Conservateur = pas de faux positif** : AND cross-product, version absente + bornes, schéma de version non géré ⇒ « non applicable », jamais une CVE fabriquée. Cohérent avec le marquage `inferred` côté finding.
- **Perf** : lookup indexé `[cpeVendor, cpeProduct]` (index 8.7a) → quelques rows ; matching en mémoire ; un `findMany` NvdCve pour les scores.

## 6. Découpage indicatif (plan)
T1 `compareCpeVersions` (+ grande table de tests) ; T2 `cpe-matcher` (parseCpe, cpeMatchApplies, evaluateNode, cveApplies + tests) ; T3 `CpeCveResolver` (mirror-first/live-fallback + tests) ; T4 brancher `CveDiscoveryProcessor` sur le résolveur (+ adapter ses tests) ; T5 validation + `nx build`.

## 7. Auto-revue
- **Couverture:** comparateur + matcher (purs, libs/cve) + résolveur (worker) + branchement = la chaîne offline complète, branchée sur le discovery existant. ✅
- **Cohérence:** réutilise `NvdCpeMatch`/`NvdCve`/`NvdSyncState` (8.7a), `CpeCveMatch`/`findCvesByCpe` (8.6, fallback), `cvssToSeverity` ; blast radius = un seul appel remplacé dans le processor. L'aval (cache/finding/enrichment/risk) intact.
- **« Best » assumé:** comparateur robuste (pas semver naïf), AND conservateur (zéro faux positif), mirror-autoritatif (offline réel, pas de fallback masquant un « 0 légitime »).
- **Risques:** (a) sémantique de version exotique → conservateur (non applicable, pas faux positif) + tests ; (b) nœuds AND multi-OS → conservateur ; (c) mirror partiel (full pas fini) → gate sur `fullSyncCompletedAt`, fallback live entre-temps.
- **Scope:** un seul plan ; purs en lib + résolveur en worker. Pas de changement Prisma, pas de front.
- **Ambiguïté levée:** mirror-first gated sur `fullSyncCompletedAt` ; 0-mirror autoritatif ; AND conservateur ; comparateur segment-based documenté.
