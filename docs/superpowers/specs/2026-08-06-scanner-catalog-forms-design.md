# Scanner catalogue live + formulaires d'options par outil

**Date:** 2026-08-06
**Status:** Approved

## Problem

Deux problèmes distincts constatés dans le frontend :

1. **La page « Outils » (`/tools`) ne montre que `nmap`.** Elle interroge `toolActivity`
   (`apps/api-gateway/src/app/tools/tools.service.ts`), qui agrège les lignes `ScanJob`
   **réellement exécutées** en base. Ce n'est donc pas le catalogue des 120 scanners installés,
   mais un historique d'activité. Comme seul `nmap` a déjà tourné, seul `nmap` s'affiche.
2. **Le sélecteur de scanner (page « Run a scan ») est codé en dur.**
   `apps/frontend/src/features/scans/scanner-catalog.ts` liste ~60 noms figés — pas le registre
   live de 120 scanners, et aucune option par outil. Les options se saisissent dans un unique
   textarea « Options JSON » brut.

## Goals

- Exposer le **registre live des 120 scanners** au frontend (fin du catalogue codé en dur).
- Générer un **formulaire d'options par outil** dérivé automatiquement du `inputSchema` Zod du
  scanner, avec chaque champ optionnel activable/désactivable (« ajouter ou non »).
- La page « Outils » affiche le **catalogue complet** (120), enrichi des stats d'activité, avec
  une action « Lancer » par outil.

## Non-goals (YAGNI)

- Ne pas ajouter `.describe()` sur les 120 schémas maintenant : l'aide par champ est best-effort
  (nom + contraintes + `.describe()` là où il existe déjà). Enrichissement possible en suivi.
- Pas de drawer de lancement sur `/tools` : une carte « Lancer » présélectionne le scanner sur la
  page Run-scan.

## Key invariant (unchanged)

La mutation `runScan` (`scans.service.ts:51-81`) valide déjà `scannerName` contre
`ScannerRegistry` **et** valide `optionsJson` contre le `inputSchema` Zod du scanner. Le
formulaire ne fait que produire un `optionsJson` valide — **le contrat backend ne change pas**.

## Design

### 1. Backend — introspecteur Zod + query GraphQL

- **Introspecteur** — `libs/scanner-sdk/src/describe-input.ts` :
  `describeScannerInput(schema): ScannerFieldDescriptor[]`. Parcourt le `ZodObject` top-level
  (déballe `ZodDefault` / `ZodOptional`) et émet par champ :
  - `name`
  - `type` : `'string' | 'number' | 'boolean' | 'enum' | 'string[]' | 'number[]' | 'enum[]'`
  - `required` : `true` si ni `.optional()` ni `.default()`
  - `default` : valeur par défaut si présente (scalaire JSON)
  - `min` / `max` : pour les nombres (checks `ZodNumber`)
  - `enumValues` : pour `ZodEnum` (ou `ZodArray<ZodEnum>`)
  - `description` : `schema.description` si `.describe()` a été utilisé, sinon `null`
  - Un schéma vide (`z.object({})`, ex. `shodan`) → `[]`.
- **Query** `scannerCatalog: [ScannerCatalogEntry!]!` adossée à `ScannerRegistry.list()`.
  Renvoie, par scanner : `name`, `displayName`, `description`, `categories`,
  `requiresCredential`, `fields[]`. Pas de DB, pas de secret ; derrière le guard auth standard.
- **DTO** : `ScannerCatalogEntryObject`, `ScannerFieldObject`. `default` et `enumValues` passent
  via un scalaire JSON (réutiliser le scalaire JSON existant du schéma GraphQL, ou stringifier).

### 2. Frontend — formulaire dynamique (page « Run a scan »)

- Nouvelle query `SCANNER_CATALOG_QUERY` dans `lib/graphql/queries.ts`.
- `scanner-select.tsx` : remplacer `SCANNER_CATALOG` codé en dur par les données live, groupées
  par catégorie, recherche conservée → les 120 apparaissent.
- Nouveau `scanner-options-form.tsx` : un contrôle par descripteur de champ —
  - `boolean` → checkbox (valeur par défaut)
  - `number` → input number avec `min`/`max`, défaut
  - `string` → input texte, défaut
  - `enum` → `<select>`
  - `string[]` / `number[]` → saisie CSV / chips ; `enum[]` → multi-select
  - Champ `required=false` **sans défaut** → toggle « activer » ; décoché ⇒ champ **omis** de
    l'`optionsJson`.
  - Indice visuel si `requiresCredential` (clé API requise).
- `scan-run-page.tsx` : le formulaire remplace le textarea « Options JSON », mais on garde un
  repli « mode JSON avancé » repliable qui édite le même état.

### 3. Refonte page « Outils »

- `tools-grid.tsx` : partir du **catalogue complet** (query `scannerCatalog`) et fusionner les
  stats de `toolActivity` par `scannerName` (jointure à gauche). Un outil jamais lancé s'affiche
  avec compteurs à zéro / « jamais exécuté ». Groupement par catégories live (fin de la dépendance
  à `SCANNER_CATALOG` figé pour la catégorisation).
- Chaque carte : action **« Lancer »** → navigation vers la page Run-scan avec le scanner
  présélectionné (state de route / param).
- `scanner-catalog.ts` (map figée) devient superflu pour la source de vérité ; on peut le retirer
  ou le réduire à un fallback. Décision d'implémentation : le remplacer par la catégorisation issue
  du catalogue live.

## Testing

- **Unitaires introspecteur** : nmap (string/number/bool/array/customArgs), httpx (number[] + min/max),
  nuclei (arrays `.optional()` sans défaut → toggles), ffuf (strings avec défaut), shodan (`z.object({})` → `[]`).
- **Resolver** : `scannerCatalog` renvoie 120 entrées, chacune avec `fields` cohérents.
- **Front** : rendu des champs selon descripteur ; sérialisation `optionsJson` (défauts inclus,
  champ optionnel non activé omis) ; sélection depuis /tools présélectionne le scanner.

## Rollout

Purement additif côté API (nouvelle query) + refonte frontend. Aucune migration de données.
Le contrat `runScan` est inchangé, donc rétrocompatible.
