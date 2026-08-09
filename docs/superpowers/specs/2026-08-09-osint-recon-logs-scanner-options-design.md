# Design — Séparation OSINT/Recon, logs de run persistés, options & presets scanners

Date : 2026-08-09
Statut : approuvé (brainstorming), prêt pour plan d'implémentation.

## Contexte & problèmes constatés

Trois plaintes opérateur, toutes confirmées dans le code :

1. **OSINT et Recon mélangés** — la page Recon affiche tous les scanners (OSINT compris) et la page OSINT affiche la même liste de jobs que Recon.
2. **Jamais de logs sur les runs** — les logs sont diffusés en live-tail éphémère (Redis `PUBLISH`, zéro rétention) et jamais persistés ; un scan terminé montre une boîte vide.
3. **Aucune option configurable** — depuis le cockpit on ne peut saisir que la cible ; la majorité des scanners exposent 0 à 3 options, presque aucune n'a de description, et il n'existe aucun concept de « commandes couramment lancées ».

### Décisions de conception (issues du brainstorming)

- Traiter les 3 sujets dans **un spec global**, implémentés dans l'ordre **logs → séparation → options**.
- Presets : **hybride** — presets curés livrés maintenant + télémétrie d'usage pour affiner ensuite.
- Options : **les deux combinés** — champs typés à la main pour le top des outils + sélecteur de flags Kali générique + arguments bruts partout.
- Logs : **MinIO + Query backfill** (durable, réutilise l'infra existante, pas de migration DB).
- Classement OSINT/Recon : **catégorie primaire déclarée** — un outil apparaît sur une seule page.

## Fondation partagée — la catégorie comme source de vérité

Aujourd'hui, la classification OSINT/Recon est incohérente : le launcher Recon ne filtre pas du tout, la page OSINT utilise une liste de noms en dur (`osint-presets.ts`) déconnectée de l'enum `ScannerCategory`, et `groupForCategories()` prend la *première* catégorie de la liste (ordre implicite).

On établit **une seule source de vérité** :

- Champ optionnel **`primaryCategory?: ScannerCategory`** sur `ScannerDefinition`
  (`libs/scanner-sdk/src/types.ts`). Défaut = `category[0]` si absent.
- Constante **`OSINT_CATEGORY_SET = { 'osint', 'identity-osint', 'passive-recon', 'breach-intel' }`**
  et helper **`isOsintScanner(name): boolean`** exportés depuis `libs/scanner-sdk`
  (ou `libs/scanners/all`), résolus via `ScannerRegistry`.
- Règle : un scanner est **OSINT** si `primaryCategory ∈ OSINT_CATEGORY_SET`, sinon **RECON**.
  Chaque outil apparaît sur **exactement une** page.
- Les outils dual-taggés dont la primaire est mal choisie (ex. `subfinder = [passive-recon, subdomain-enum]`)
  sont corrigés au cas par cas — soit en réordonnant `category[]`, soit en posant `primaryCategory` explicitement.
- Le catalogue GraphQL (`ScannerCatalogEntryObject`) expose `primaryCategory` pour que le frontend
  puisse filtrer sans dupliquer la logique.

Cette fondation est écrite en premier car les sections 1 et 3 en dépendent.

---

## Section 2 — Logs de run persistés (implémenté en 1er)

### État actuel (diagnostic)

- `apps/scan-worker/src/app/scan-job.processor.ts` publie chaque chunk via `safePublish` sur le canal
  Redis `scanjob:logs:<scanJobId>` (`PUBLISH`, fire-and-forget, aucune rétention).
- L'API expose **uniquement une Subscription** `scanJobLogs` (`scans.resolver.ts`), pas de Query.
- `LiveLogsPane` accumule dans un `useState` React réinitialisé à chaque démontage/refresh.
- `stderr` (où sont les erreurs scanner) est **jeté** — seul un flux est bufferisé (`capturedStream`).
- `kali-tool-worker` (`kali-run.processor.ts`) ne publie **aucun** log (pas de `LogStreamModule`).

Cause racine : logs 100 % éphémères, jamais persistés → un scan terminé = boîte vide définitive.

### Conception

1. **Capture stdout + stderr combinés.** Dans le worker, brancher `onStdout` **et** `onStderr`
   vers le même accumulateur (aujourd'hui stderr est ignoré). Préfixer optionnellement les lignes stderr.

2. **Persistance MinIO, clé déterministe.** `LogStream` accumule le texte combiné et flush vers MinIO
   sous **`logs/<scanJobId>.log`** :
   - flush périodique (par ex. toutes les ~2 s ou tous les ~32 Ko, seuil à valider dans le plan),
   - flush final garanti à la fin du run (succès **ou** échec, y compris timeout/erreur).
   - Clé déterministe → **pas de migration Prisma** (pas besoin de stocker `logsKey`).

3. **Query backfill.** Nouvelle Query GraphQL **`scanJobLogs(scanJobId: ID!): String!`**
   (nom distinct de la Subscription — ex. `scanJobLogHistory` si collision de nom) qui lit le blob MinIO
   et renvoie le texte accumulé. Chaîne vide si aucun log encore écrit.

4. **Frontend backfill-puis-live.** `LiveLogsPane` :
   - au montage → exécute la Query backfill, initialise le buffer avec l'historique ;
   - **puis** attache la Subscription pour la suite live (dédup si un chunk arrive dans les deux) ;
   - corrige à la fois la boîte vide sur scan terminé **et** la course sur les scans rapides
     (`scan-run-page.tsx` positionne `activeJobId` après résolution de la mutation).

5. **`kali-tool-worker`.** Ajouter `LogStreamModule` à son `AppModule` et brancher `onStdout`/`onStderr`
   → même pipeline de publication + persistance. Fin du worker « muet ».

### Invariants / risques

- Idempotence : le flush final doit être sûr sur retry (réécriture d'un même blob = OK).
- Le flush périodique ne doit jamais faire échouer le run si MinIO est indisponible (best-effort, log interne).

---

## Section 1 — Séparation OSINT / Recon (implémenté en 2e)

### État actuel (diagnostic)

- **Launcher Recon** (`apps/frontend/src/features/cockpit/cockpit-command-bar.tsx`) : `SCANNER_CATALOG_QUERY`
  non filtrée ; seul filtre = forme de la cible (`acceptsTarget`), jamais la catégorie ;
  `CATEGORY_ORDER` inclut explicitement `'OSINT'` ; case `showAll` qui désactive même le filtre de cible.
- **Liste de jobs OSINT** (`osint-cockpit-page.tsx` → `useActiveScanners`) : interroge `ALL_SCANS_QUERY`
  avec `{ engagementId, statusIn }` — **aucun** prédicat de catégorie → montre tous les jobs de l'engagement.
  Idem `FindingsFluxFeed`.
- **Set OSINT** (`apps/api-gateway/src/app/osint/osint-presets.ts`) : liste de noms en dur, divorcée de l'enum.

### Conception

1. **Launcher Recon** — exclure les scanners OSINT via `isOsintScanner` / `primaryCategory` ;
   retirer `'OSINT'` de `CATEGORY_ORDER` ; restreindre (ou retirer) `showAll` au périmètre Recon
   pour qu'il ne réintroduise pas l'OSINT.

2. **Launcher OSINT** — ne lister que les scanners OSINT (dérivés de la catégorie). Les presets par type de
   seed (EMAIL/USERNAME/PERSON/DOMAIN) de `osint-presets.ts` sont **conservés** mais réconciliés :
   tout scanner d'un preset doit être OSINT par catégorie, et les OSINT-catégorisés jusque-là inaccessibles
   (shodan, censys, sherlock, socialscan, h8mail, intelx, leakix, phoneinfoga, trufflehog…) deviennent
   listables.

3. **Filtre serveur des listes jobs/findings** — ajout d'un argument optionnel **`group: OSINT | RECON`**
   (enum GraphQL) sur les requêtes `scans` et findings. Le résolveur mappe chaque job à sa catégorie via
   le `ScannerRegistry` et filtre. Choix du filtre **serveur** (pas client) pour rester correct malgré la
   pagination. La page OSINT passe `group: OSINT`, la page Recon `group: RECON`.

### Invariants / risques

- Un scanner sans `primaryCategory` ni `category[]` exploitable tombe par défaut en RECON (fail-safe :
  on n'expose pas accidentellement un run en OSINT).
- Test d'invariant existant (`libs/scanner-sdk/src/__tests__/scanner-category.spec.ts`) à étendre :
  chaque scanner doit résoudre vers exactement un groupe.

---

## Section 3 — Options + presets scanners (implémenté en 3e)

### État actuel (diagnostic)

- Le contrat backend est **déjà capable** : `runScan` accepte `optionsJson`, validé contre le Zod du scanner,
  persisté dans `ScanJob.input`, passé à `build()`.
- Un formulaire dynamique **existe** sur `/scans` (`scanner-options-form.tsx`, introspection via
  `describeScannerInput`) — mais **la barre du cockpit** envoie `optionsJson: ''` (target seul).
- **40/120 scanners** ont `z.object({})` (zéro option), la plupart 1-3 champs, **7/120** utilisent `.describe()`.
- Un panneau de doc Kali (`kali-tool-doc-panel.tsx`) affiche `flag`/`argHint`/`description` par outil,
  mais **déconnecté** des contrôles du formulaire.
- Aucun concept de preset/recette/profil nulle part.

### Conception

1. **Options dans le cockpit.** La barre du cockpit route vers le **même `ScannerOptionsForm`**
   (expander « Options » avant lancement). Correction directe de « je ne peux mettre que l'IP ».

2. **Échappatoire universelle `extraArgs`.** Champ conventionnel **`extraArgs: string[]`** traité
   **centralement** : après `build()`, le worker (ou le dispatch) append `extraArgs` à l'`argv` docker
   construit — **sans toucher les 120 `build()`**. Validation : liste de chaînes ; contexte mono-opérateur
   pentest → append de flags arbitraires accepté. Rendre `extraArgs` visible dans le formulaire pour tous
   les scanners.

3. **Sélecteur de flags Kali (générique).** Le formulaire lit les flags documentés du dataset Kali
   (`kaliTool(binary).options[]`) pour l'outil sélectionné ; cocher/renseigner un flag l'ajoute à `extraArgs`
   (avec son `argHint`). Les `description` du dataset fournissent l'explication **« gratuite »** pour tous
   les outils référencés Kali.

4. **Champs typés à la main (top ~20).** Enrichir les schémas Zod (champs + `.describe()`) des outils les
   plus utilisés : nmap, nuclei, ffuf, httpx, gobuster, sqlmap, masscan, naabu, subfinder, katana, dirsearch,
   wpscan, dnsx, feroxbuster, whatweb, nikto, testssl, amass, dalfox, kiterunner (liste finale arrêtée dans
   le plan). Ces champs bénéficient de la validation Zod et de contrôles typés (select/checkbox/number).

5. **Presets curés.** Nouveau champ **`presets?: ScannerPreset[]`** sur `ScannerDefinition`, avec
   `{ id, name, description, options }`. Exposé dans `ScannerCatalogEntryObject`. Rendu en **chips cliquables**
   dans le formulaire qui **pré-remplissent** les champs (options + `extraArgs`). 3-6 recettes canoniques par
   outil du top (ex. nmap : « Quick top-1000 », « Full TCP + scripts + OS », « UDP top-100 »).
   La `description` du preset porte le **« pourquoi »** de la recette (explication de la commande).

6. **Télémétrie d'usage (hybride, sans nouvelle table).** On **agrège l'historique `ScanJob` existant**
   (`scannerName` + `input`) pour calculer le « top des options réellement lancées ». Nouvelle Query
   **`scannerUsageStats(scannerName): [...]`** qui renvoie les combinaisons d'options les plus fréquentes,
   utilisée pour **réordonner/compléter** les presets curés. Aucune migration.

7. **Explication de chaque commande.** Connecter le panneau de doc Kali existant au formulaire
   (l'outil sélectionné pilote la doc affichée) ; la description du preset + la `description` du scanner
   donnent le contexte de haut niveau.

### Invariants / risques

- `describeScannerInput` ne gère que les objets plats — les champs ajoutés doivent rester top-level
  (pas d'objets imbriqués), sinon ils tombent en `type: unknown` (texte libre).
- `extraArgs` central : s'assurer que l'append respecte la séparation argv (pas de shell-splitting naïf) —
  chaque élément du tableau = un argument docker distinct.
- Presets : les `options` d'un preset doivent valider contre le Zod du scanner (test).

---

## Ordre d'implémentation

1. **Fondation partagée** (`primaryCategory`, `OSINT_CATEGORY_SET`, `isOsintScanner`, exposition catalogue).
2. **Section 2 — Logs** (capture stderr, persistance MinIO, Query backfill, frontend backfill-puis-live, kali-tool-worker).
3. **Section 1 — Séparation** (launcher Recon, launcher OSINT, filtre serveur `group`).
4. **Section 3 — Options** (cockpit form, `extraArgs` central, sélecteur Kali, top-20 typés, presets curés, `scannerUsageStats`, doc Kali).

## Hors périmètre (YAGNI)

- Enrichir manuellement les 120 schémas (on couvre le top-20 + générique Kali + `extraArgs` pour le reste).
- Nouvelle table de télémétrie (on agrège `ScanJob`).
- Migration Prisma pour les logs (clé MinIO déterministe).
- Refonte des templates de recon (les presets sont par-scanner, pas des chaînes multi-étapes).

## Fichiers clés touchés (indicatif)

- `libs/scanner-sdk/src/types.ts`, `describe-input.ts`, `registry.ts`
- `libs/scanners/all/src/all-scanners.module.ts` (+ ~20 fichiers scanner du top pour options/presets)
- `libs/log-stream/src/*`, `libs/docker-runner/src/*`
- `apps/scan-worker/src/app/scan-job.processor.ts`, `apps/kali-tool-worker/src/app/*`
- `apps/api-gateway/src/app/scans/*`, `apps/api-gateway/src/app/tools/*`, `apps/api-gateway/src/app/osint/*`
- `apps/frontend/src/features/cockpit/*`, `features/osint/*`, `features/scans/*` (`scanner-options-form.tsx`, `live-logs-pane.tsx`, `kali-tool-doc-panel.tsx`)
