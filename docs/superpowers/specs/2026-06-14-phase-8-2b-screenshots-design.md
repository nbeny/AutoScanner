# Phase 8.2b — Web Screenshots — Design

> **Date:** 2026-06-14
> **Statut:** Spec V1 — issue du brainstorming (axe enrichissement, morceau « screenshots » carve-out de 8.2). En attente de revue avant `writing-plans`.
> **Parent:** Phase 8. 8.1 (passive) + 8.2 (enrichissement) livrées. 8.2b = la pièce qui demandait une vraie évolution d'infra (capture d'artefact binaire), donc isolée.
> **Précédent de référence:** patron scanner Phase 8.1/8.2.

---

## 1. Objectif et critère « done »

**Objectif:** capturer une **capture d'écran (PNG)** de chaque host web découvert (gowitness) et la rendre consultable, en réutilisant au maximum le stockage objet + presign existants.

**Approche:** ajouter au scan-worker la **capacité de capturer un artefact fichier** (le type `ScannerOutput.capture` supporte déjà `{ path }`, jamais implémenté), puis un scanner `gowitness` qui l'utilise. Le PNG devient le `rawOutput` du scan job → servi par le presign existant. **Zéro nouveau modèle Prisma.**

**Critère « done » 8.2b:**
1. Le scan-worker gère `output.capture: { path }` : crée un dossier hôte unique par job, le **bind-monte** sur un point de montage conteneur (`/output`), passe ce chemin au scanner via `ctx.scratchDir`, exécute, **lit le fichier produit** dans le dossier hôte, le `putObject` dans `raw-outputs` avec le bon `contentType` (`image/png`), set `rawOutputKey`, marque le job COMPLETED, et **n'enqueue PAS de parse-job** (artefact binaire, rien à normaliser). Nettoie le dossier hôte.
2. Scanner `gowitness` enregistré dans `AllScannersModule` : `build()` lance `gowitness single <url> --screenshot-path <ctx.scratchDir>`, `outputs[0] = { format: 'BINARY', capture: { path: '<fichier>' }, parser: 'noop' }`, `produces: ['Screenshot']` (ou `[]`).
3. Dockerfile `gowitness` (image headless chrome). Template optionnel `web-screenshot` (ou ajout de gowitness à `web-enrich`).
4. Le PNG est récupérable via le `getRawOutputPresignedUrl` **existant** (endpoint REST scan job raw + champ GraphQL). Aucun nouveau modèle.
5. Tests : unitaires scan-worker (capture fichier → store binaire, skip parse, cleanup) + scanner build ; e2e opt-in `SCREENSHOT_E2E`.
6. CI verte incl. `nx build` (scan-worker touché).

**Non-buts (hors-scope 8.2b):**
- Vignette/galerie UI riche → tâche de polish séparée (le presign existant suffit à afficher le PNG en V1).
- Multi-screenshots par run / diff visuel / clustering par similarité → V2.
- Nouveau modèle `Screenshot` ou champ dédié → on réutilise `ScanJob.rawOutputKey` (le PNG EST le rawOutput du job gowitness ; le lien vers le host est le `target` du job).

---

## 2. Composants

### 2.1 Capacité cœur — capture d'artefact fichier (scan-worker)
`apps/scan-worker/src/app/scan-job.processor.ts`. Aujourd'hui `output.capture` ∈ `'stdout'|'stderr'` et le worker accumule les chunks texte. Ajout d'une branche **file-capture** quand `typeof output.capture === 'object'` :
- Avant le run : créer `hostDir = <os.tmpdir()>/autoscanner-art-<scanJobId>` (mkdir). Ajouter au `runSpec.binds` un bind `{ src: hostDir, dst: '/output' }` (writable). Passer au scanner `ctx.scratchDir = '/output'` (chemin conteneur où écrire).
- Pas de capture stdout pour le rawOutput (stdout reste streamé au log-stream pour le live-log, mais n'est pas le rawOutput).
- Après le run (succès, exit 0) : lire le(s) fichier(s) dans `hostDir`. Prendre le fichier attendu (`output.capture.path` = nom de fichier, ou le seul fichier présent). Si aucun fichier → FAILED (« no artifact produced »).
- `putObject('raw-outputs', key, buffer, contentType)` — `contentType` déduit de l'extension (`.png`→`image/png`) ou de `output.format`. `key` via `rawOutputKey({..., format: 'BINARY'})`.
- Cap de taille : refuser un artefact > `MAX_RAW_OUTPUT_BYTES` (déjà défini) → FAILED.
- **Skip parse enqueue** quand `format === 'BINARY'` (ou capture objet). Marquer le job COMPLETED avec `rawOutputKey`.
- `finally` : `rm -rf hostDir`.
- Boundaries : le bind est writable (gowitness écrit le PNG) ; `readonlyRootfs` reste true (le PNG va dans le bind, pas le rootfs). Sécurité : `hostDir` est créé par le worker (pas attaquant-contrôlé), nettoyé après.

### 2.2 Scanner `gowitness`
`libs/scanners/gowitness/`. `build(_input, target, ctx)` :
```
cmd: ['sh','-lc', `gowitness single ${shellQuoteSingle(target)} --screenshot-path ${ctx.scratchDir} --disable-db || true`]
```
(gowitness écrit `<host>.png` dans `--screenshot-path`.) `outputs[0] = { format: 'BINARY', capture: { path: '' }, parser: 'noop' }` (path vide ⇒ le worker prend le seul fichier produit). `produces: ['Screenshot']`. `category: [WEB_FINGERPRINT]`. Pas de credential. Image `autoscanner/gowitness:1.0` (headless chromium).

### 2.3 Surface
Le PNG est le rawOutput du job gowitness → l'endpoint REST existant `GET /scans/jobs/:id/raw` (presign) et le champ GraphQL associé le servent déjà. V1 = pas de nouveau GraphQL. (Polish futur : un champ `screenshotUrl` sur l'asset qui résout le dernier job gowitness ciblant ce host.)

---

## 3. Validation & tests
- **scan-worker unitaire:** mock docker-runner (écrit un PNG factice dans le hostDir via un faux `run` qui crée le fichier) + mock storage + spy fs : (1) capture objet → bind ajouté + ctx.scratchDir='/output' ; (2) fichier lu + putObject binaire avec contentType image/png ; (3) parse-job NON enqueué ; (4) job COMPLETED + rawOutputKey ; (5) aucun fichier → FAILED ; (6) artefact > cap → FAILED ; (7) hostDir nettoyé. Conserver les tests stdout/stderr existants verts (la branche texte est inchangée).
- **gowitness scanner:** build() construit la bonne cmd + quote le target + capture objet + format BINARY.
- **e2e opt-in** `SCREENSHOT_E2E=1` : runTemplate (gowitness) sur un host → job COMPLETED + `getRawOutputPresignedUrl` renvoie une URL → GET → content-type image/png + body non vide.
- **CI:** lint/type-check/test + **build** scan-worker/parser-worker/api-gateway.

## 4. Sécurité & boundaries
- `hostDir` créé/possédé par le worker, unique par job, supprimé après (pas de fuite inter-jobs). Bind writable limité à ce dossier.
- Cap de taille appliqué (réutilise `MAX_RAW_OUTPUT_BYTES`).
- gowitness lance un chromium headless dans le sandbox Docker (limites mém/CPU/timeout ; `--no-sandbox` requis en conteneur → documenter ; mémoire plus haute, ex. 1 GiB).
- `target` quoté (anti-injection).

## 5. Découpage indicatif (plan)
T1 capacité file-capture scan-worker (TDD, le cœur) ; T2 scanner gowitness + tests ; T3 Dockerfile gowitness ; T4 register + (optionnel) template ; T5 e2e + validation (+ build).

## 6. Auto-revue
- Le seul changement transverse est le scan-worker (§2.1) — bien isolé dans une branche `capture objet`, la branche texte existante intacte.
- Zéro modèle Prisma (réutilise rawOutputKey + presign). `RawOutputFormat` a déjà `BINARY`. `ScannerOutput.capture` a déjà `{ path }`.
- Hors-scope explicite : UI riche, multi-shot, modèle dédié.
