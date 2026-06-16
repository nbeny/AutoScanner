# Phase 8.7a — NVD Offline Mirror: Data Layer + Sync Worker — Design

> **Date:** 2026-06-16
> **Statut:** Spec V1 — validée en brainstorming (option « best »). En attente de revue avant `writing-plans`.
> **Parent:** Phase 8.7 = mirror NVD offline (durcissement reporté depuis la 8.6, qui utilise l'API NVD *live*). Décomposé : **8.7a = couche données + sync** (cette spec) ; **8.7b = moteur de match offline + branchement discovery** (spec séparée).
> **Choix produit assumé:** « la meilleure solution » — worker dédié isolé, trigger cron répétable auto-réparant, et **stockage fidèle de l'arbre de configuration NVD** (AND/OR/negate) pour permettre un matcher *correct* en 8.7b.

---

## 1. Objectif et critère « done »

**Objectif:** maintenir une **copie locale complète du dataset NVD** — chaque CVE + sa structure d'applicabilité CPE (avec plages de versions et logique AND/OR) — synchronisée par bulk initial puis incrémental planifié. **Aucun matching ni intégration discovery dans cette phase** (c'est la 8.7b).

**Critère « done » 8.7a:**
1. Modèles Prisma `NvdCve`, `NvdConfigNode`, `NvdCpeMatch`, `NvdSyncState` (+ migration). `CveCache`/`CpeCveCache` (8.6) restent inchangés.
2. `NvdClient.fetchCvePage({ startIndex, resultsPerPage, lastModStartDate?, lastModEndDate? })` — page de l'API NVD 2.0 incluant les `configurations` parsées, paginée/tolérante (réutilise rate-limiter + retry/429).
3. Une **app worker dédiée `nvd-sync-worker`** consommant une queue `NVD_SYNC` :
   - **full sync** (à froid, résumable via `lastStartIndex`) : upsert `NvdCve` + remplacement de ses nœuds/matches ; pose `fullSyncCompletedAt` + `lastModEndDate = now`.
   - **incrémental** (`[lastModEndDate, now]`, fenêtres ≤120 j) : upsert des CVE modifiées, avance le curseur.
   - Idempotent, résumable, rate-limité ; `NvdRateLimitedError` → reschedule (patron 8.6).
4. **Trigger** : job **répétable BullMQ** (`repeat: { pattern: <cron> }`) enregistré au boot du worker (incrémental quotidien) + une **full re-sync périodique** (hebdo/mensuelle, capte les changements du dictionnaire CPE) + possibilité de trigger manuel (enqueue d'un job `NVD_SYNC`).
5. Tests unitaires : `fetchCvePage` (pagination, fenêtre lastMod, configurations parsées, 429), le sync service (full résumable, incrémental, upsert nœuds/matches, idempotence) — **NVD mocké, jamais de réseau en test**.
6. CI verte incl. `nx build` du nouveau worker. Aucun changement front.

**Non-buts (hors-scope 8.7a):**
- **Moteur de match offline** (évaluer un CPE de service contre les `NvdCpeMatch` avec plages de versions + AND/OR) → **8.7b**.
- **Branchement de `findCvesByCpe`/`CveDiscoveryProcessor`** sur le mirror (avec fallback API live) → **8.7b**.
- **Distinction front « vérifié vs inféré »** → phase UI séparée.
- **Mirror du dictionnaire CPE complet** (produits/titres) — 8.7a stocke les `cpeMatch` portés par les CVE, suffisant pour le matching ; pas le dictionnaire CPE séparé.

---

## 2. Modèle de données

```prisma
model NvdCve {
  cveId        String    @id          // "CVE-2024-1234"
  cvssV3Score  Float?
  cvssV3Vector String?
  severity     Severity?
  summary      String?
  publishedAt  DateTime?
  lastModified DateTime?
  syncedAt     DateTime  @default(now())
  nodes        NvdConfigNode[]
  @@index([lastModified])
}

model NvdConfigNode {
  id       String   @id @default(cuid())
  cveId    String
  operator NvdConfigOperator           // AND | OR
  negate   Boolean  @default(false)
  cve      NvdCve   @relation(fields: [cveId], references: [cveId], onDelete: Cascade)
  matches  NvdCpeMatch[]
  @@index([cveId])
}

model NvdCpeMatch {
  id                      String  @id @default(cuid())
  nodeId                  String
  criteria                String  // cpe:2.3 string
  vulnerable              Boolean
  cpeVendor               String  // parsed from criteria for fast lookup
  cpeProduct              String
  versionStartIncluding   String?
  versionStartExcluding   String?
  versionEndIncluding     String?
  versionEndExcluding     String?
  node                    NvdConfigNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  @@index([cpeVendor, cpeProduct])
  @@index([nodeId])
}

model NvdSyncState {
  id                  String    @id @default("singleton")
  lastModEndDate      DateTime?      // cursor: CVEs modified up to here are synced
  fullSyncCompletedAt DateTime?
  lastFullSyncAt      DateTime?
  lastStartIndex      Int       @default(0)  // resume point during an in-progress full sync
  totalCves           Int       @default(0)
  updatedAt           DateTime  @updatedAt
}

enum NvdConfigOperator { AND OR }
```

- **Fidélité:** un `NvdCve` a N `NvdConfigNode` (chaque nœud = un groupe `operator`+`negate`), chaque nœud a M `NvdCpeMatch`. Reproduit `cve.configurations[].nodes[]` de l'API NVD 2.0. Permet au matcher 8.7b d'évaluer AND/OR/negate correctement.
- **Lookup:** `NvdCpeMatch.@@index([cpeVendor, cpeProduct])` — point d'entrée du matcher 8.7b (filtre vendor+product, puis évalue les plages de versions + la logique de nœud).
- **`Severity`** réutilise l'enum Prisma existant ; CVSS dérivé via `cvssToSeverity` (libs/cve).

---

## 3. Architecture & flux

```
nvd-sync-worker (app dédiée, headless ApplicationContext comme cve-enricher-worker)
  au boot : enregistre 2 jobs répétables BullMQ sur la queue NVD_SYNC :
     - { mode: 'incremental' }  repeat cron quotidien
     - { mode: 'full' }         repeat cron hebdo/mensuel
  + trigger manuel possible (enqueue { mode } ad hoc)

NvdSyncProcessor.process({ mode }) :
  state = upsert/lire NvdSyncState (singleton)
  si mode 'full' OU pas de fullSyncCompletedAt :
     boucle pages depuis state.lastStartIndex :
        page = NvdClient.fetchCvePage({ startIndex, resultsPerPage:2000 })
        pour chaque cve : upsert NvdCve ; supprime+recrée ses NvdConfigNode/NvdCpeMatch (cascade)
        state.lastStartIndex = startIndex ; (persistance périodique → résumable)
     fin : fullSyncCompletedAt = now ; lastModEndDate = now ; lastStartIndex = 0 ; lastFullSyncAt = now
  sinon (incrémental) :
     window = [state.lastModEndDate, now]  (chunké ≤120 j)
     pour chaque sous-fenêtre : pages via fetchCvePage({ lastModStartDate, lastModEndDate }) → upsert
     state.lastModEndDate = now
  NvdRateLimitedError → reschedule (delay = Retry-After, sinon défaut) ; autres erreurs → throw (retry BullMQ)
```

- **Upsert d'une CVE:** `NvdCve` upsert ; ses `NvdConfigNode`+`NvdCpeMatch` sont **remplacés** (delete cascade par cveId puis recréation) — simple et correct (une CVE révisée peut changer ses configurations). Fait dans une transaction par CVE (ou par petit lot) pour l'atomicité.
- **Résumabilité:** `lastStartIndex` persisté périodiquement → un crash en plein full-sync reprend où il était.
- **Isolation:** app séparée ; le full-sync (lourd) ne bloque pas l'enrichissement/discovery (cve-enricher-worker).
- **Parsing CPE:** `cpeVendor`/`cpeProduct` extraits de `criteria` (`cpe:2.3:a:<vendor>:<product>:...`) au moment de l'écriture, pour l'index de lookup.

## 4. Validation & tests
- **`fetchCvePage`:** fetch mocké — page simple (configurations parsées : nodes+cpeMatch+version ranges), pagination (totalResults>page), fenêtre `lastModStartDate/EndDate` dans l'URL, 429 → `NvdRateLimitedError`.
- **`NvdSyncProcessor`:** Prisma + NvdClient mockés — full sync upsert N CVEs + leurs nœuds/matches ; résumabilité (démarre à `lastStartIndex`) ; incrémental utilise la fenêtre lastMod et avance le curseur ; idempotence (re-run ne duplique pas — upsert + replace) ; 429 → reschedule.
- **CI:** lint/type-check/test sur `cve`, `queues`, le nouveau `nvd-sync-worker` + `nx build` du worker. NVD jamais appelé en test.

## 5. Sécurité, perfs & boundaries
- **Sortant uniquement** vers l'API NVD ; clé API NVD optionnelle (augmente le quota, fortement recommandée pour le full-sync). Réutilise le token-bucket + backoff existants.
- **Volume:** ~250k CVEs ; full-sync de plusieurs heures sans clé (≈6 s/page) → résumable + planifié hors-pic ; incrémental quotidien léger.
- **Stockage:** plusieurs centaines de Mo (CVE + nœuds + matches) en Postgres ; index ciblés (vendor+product, lastModified).
- **Pas de secret en dur** ; clé API via env (comme l'enricher).
- **Idempotence/atomicité:** upsert + replace par CVE en transaction ; curseur singleton.

## 6. Découpage indicatif (plan)
T1 modèles `NvdCve`/`NvdConfigNode`/`NvdCpeMatch`/`NvdSyncState` + enum + migration ; T2 `NvdClient.fetchCvePage` (+ typing `configurations`, tests) ; T3 queue `NVD_SYNC` + payload (`{ mode: 'full'|'incremental' }`) ; T4 app `nvd-sync-worker` (scaffold depuis `cve-enricher-worker`) + `NvdSyncProcessor` (full/incrémental/résumable, tests) ; T5 enregistrement des jobs répétables (cron) au boot + trigger manuel ; T6 validation + `nx build`.

## 7. Auto-revue
- **Couverture:** mirror complet (CVE + applicabilité CPE fidèle) + sync bulk/incrémental planifié + isolation worker. ✅
- **Cohérence:** réutilise `NvdClient`/rate-limiter/`Severity`/`cvssToSeverity` ; ne touche pas l'enricher/discovery (8.6 inchangé) ; `CveCache` coexiste (8.7b décidera de la convergence).
- **« Best » assumé:** worker dédié (isolation), cron répétable (auto-réparant), arbre de config fidèle (matcher correct en 8.7b) — vs les options simples écartées (extension worker / auto-reschedule / aplatissement).
- **Risques:** (a) durée/volume du full-sync → résumable + planifié + clé API recommandée ; (b) fidélité des configurations → modèle nœud/négation ; (c) fenêtre lastMod ≤120 j → chunking.
- **Scope:** un seul plan (données + sync). Le matcher + l'intégration = **8.7b** (spec séparée).
- **Ambiguïté levée:** worker dédié, cron BullMQ, arbre fidèle, replace-on-upsert, hors-scope matcher/discovery/front.
