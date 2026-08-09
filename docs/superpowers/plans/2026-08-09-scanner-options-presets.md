# Plan 3 — Options & presets scanners (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'opérateur de configurer réellement chaque scanner : options depuis le cockpit (plus seulement `/scans`), échappatoire `extraArgs` universelle vers n'importe quel flag, presets « recettes » cliquables avec explications, champs typés enrichis sur le top des outils, doc de flags Kali branchée, et un vrai « top des options utilisées » agrégé de l'historique.

**Architecture:** `extraArgs` (liste de chaînes) voyage hors du Zod par-scanner : préservé à l'entrée (`ScansService`) et **injecté centralement** dans la commande docker par le worker — zéro `build()` à toucher. `presets` devient un champ du contrat scanner, exposé au catalogue et rendu en chips qui pré-remplissent le formulaire. Le formulaire gagne un contrôle `extraArgs` et les chips presets. Le cockpit route vers ce même formulaire. La doc Kali existante devient cliquable pour injecter un flag. `scannerUsageStats` agrège `ScanJob.input`.

**Tech Stack:** Zod, NestJS 11 GraphQL code-first (`graphql-type-json`), Prisma, React + Apollo, Vitest/Jest.

**Référence spec:** `docs/superpowers/specs/2026-08-09-osint-recon-logs-scanner-options-design.md` § Section 3.

**Prérequis:** aucun blocage dur, mais s'exécute après Plan 1 & 2 (séquence choisie).

---

## Structure des fichiers

| Fichier | Rôle | Action |
| --- | --- | --- |
| `libs/scanner-sdk/src/extra-args.ts` | `EXTRA_ARGS_KEY`, `sanitizeExtraArgs`, `injectExtraArgs` (pur, testable) | Create |
| `libs/scanner-sdk/src/types.ts` | `ScannerPreset` + `presets?` sur `ScannerDefinition` | Modify |
| `libs/scanner-sdk/src/index.ts` | Exports | Modify |
| `apps/api-gateway/src/app/scans/scans.service.ts` | Préserver `extraArgs` à travers `runScan` | Modify |
| `apps/scan-worker/src/app/scan-job.processor.ts` | Injecter `extraArgs` dans `build.cmd` | Modify |
| `apps/api-gateway/src/app/tools/dto/scanner-catalog.object.ts` | Champ `presets` (JSON) | Modify |
| `apps/api-gateway/src/app/tools/scanner-catalog.service.ts` | Peupler `presets` | Modify |
| `libs/scanners/{ffuf,gobuster,httpx,nuclei,nmap,sqlmap}/src/*.scanner.ts` | Presets curés + champs typés | Modify |
| `apps/api-gateway/src/app/scans/dto/scanner-usage.object.ts` | `ScannerUsageStat` | Create |
| `apps/api-gateway/src/app/scans/scans.service.ts` | `scannerUsageStats()` | Modify |
| `apps/api-gateway/src/app/scans/scans.resolver.ts` | Query `scannerUsageStats` | Modify |
| `apps/frontend/src/features/scans/scanner-catalog.ts` | `presets?` sur l'entrée | Modify |
| `apps/frontend/src/lib/graphql/queries.ts` | `presets` dans la query + `SCANNER_USAGE_STATS_QUERY` | Modify |
| `apps/frontend/src/features/scans/scanner-options-form.tsx` | Chips presets + contrôle `extraArgs` | Modify |
| `apps/frontend/src/features/scans/kali-tool-doc-panel.tsx` | Bouton « + » par flag → `onAddFlag` | Modify |
| `apps/frontend/src/features/cockpit/cockpit-command-bar.tsx` | Panneau options dépliable | Modify |

**Noms figés :** clé `extraArgs` (`EXTRA_ARGS_KEY`), `sanitizeExtraArgs(raw): string[]`, `injectExtraArgs(cmd, extraArgs): string[]`, interface `ScannerPreset { id; name; description; options }`, Query `scannerUsageStats(scannerName): [ScannerUsageStat!]!`, `ScannerUsageStat { optionsJson: String!; count: Int! }`.

---

## Task 1 : helper `extraArgs` (pur, testable)

**Files:**
- Create: `libs/scanner-sdk/src/extra-args.ts`
- Modify: `libs/scanner-sdk/src/index.ts`
- Test: `libs/scanner-sdk/src/__tests__/extra-args.spec.ts`

- [ ] **Step 1: Écrire le test qui échoue**

`libs/scanner-sdk/src/__tests__/extra-args.spec.ts` :

```ts
import { EXTRA_ARGS_KEY, sanitizeExtraArgs, injectExtraArgs } from '../extra-args';

describe('extra-args', () => {
  it('EXTRA_ARGS_KEY vaut "extraArgs"', () => {
    expect(EXTRA_ARGS_KEY).toBe('extraArgs');
  });

  it('sanitizeExtraArgs ne garde que des chaînes non vides', () => {
    expect(sanitizeExtraArgs(['-sC', '', '  ', '-p80', 3 as unknown])).toEqual(['-sC', '-p80']);
    expect(sanitizeExtraArgs('nope')).toEqual([]);
    expect(sanitizeExtraArgs(undefined)).toEqual([]);
  });

  it('sanitizeExtraArgs borne le nombre et la longueur des arguments', () => {
    const many = Array.from({ length: 100 }, (_, i) => `-a${i}`);
    expect(sanitizeExtraArgs(many).length).toBe(50); // cap 50
    const longArg = 'x'.repeat(5000);
    expect(sanitizeExtraArgs([longArg])[0].length).toBe(1024); // cap 1024 chars/arg
  });

  it('injectExtraArgs insère juste après le binaire', () => {
    expect(injectExtraArgs(['nmap', '-p', '80', 'host'], ['-sC'])).toEqual([
      'nmap', '-sC', '-p', '80', 'host',
    ]);
  });

  it('injectExtraArgs sur cmd vide renvoie juste les extra', () => {
    expect(injectExtraArgs([], ['-h'])).toEqual(['-h']);
  });

  it('injectExtraArgs sans extra renvoie la cmd inchangée', () => {
    expect(injectExtraArgs(['nmap', 'host'], [])).toEqual(['nmap', 'host']);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `pnpm nx test scanner-sdk --testFile=extra-args.spec.ts`
Expected: FAIL — module absent.

- [ ] **Step 3: Implémentation**

`libs/scanner-sdk/src/extra-args.ts` :

```ts
/** Clé conventionnelle des arguments bruts, hors schéma Zod par-scanner. */
export const EXTRA_ARGS_KEY = 'extraArgs';

const MAX_EXTRA_ARGS = 50;
const MAX_ARG_LEN = 1024;

/**
 * Normalise une valeur `extraArgs` non fiable en liste de chaînes sûres :
 * uniquement des chaînes non vides (après trim), bornées en nombre et en taille.
 * Pas de découpage shell ni d'interprétation — chaque élément = un argument argv.
 */
export function sanitizeExtraArgs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, MAX_ARG_LEN));
    if (out.length >= MAX_EXTRA_ARGS) break;
  }
  return out;
}

/**
 * Injecte les arguments bruts juste après le binaire (index 0) — plus sûr pour
 * l'ordre des flags que de les mettre après la cible positionnelle en fin de commande.
 */
export function injectExtraArgs(cmd: string[], extraArgs: string[]): string[] {
  if (extraArgs.length === 0) return cmd;
  if (cmd.length === 0) return [...extraArgs];
  return [cmd[0], ...extraArgs, ...cmd.slice(1)];
}
```

- [ ] **Step 4: Exporter**

Dans `libs/scanner-sdk/src/index.ts`, ajouter :

```ts
export * from './extra-args';
```

- [ ] **Step 5: Vérifier le succès**

Run: `pnpm nx test scanner-sdk --testFile=extra-args.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/scanner-sdk/src/extra-args.ts libs/scanner-sdk/src/index.ts libs/scanner-sdk/src/__tests__/extra-args.spec.ts
git commit -m "feat(scanner-sdk): extraArgs sanitize + inject helpers"
```

---

## Task 2 : préserver `extraArgs` à travers `runScan`

**Files:**
- Modify: `apps/api-gateway/src/app/scans/scans.service.ts`
- Test: `apps/api-gateway/src/app/scans/__tests__/extra-args-runscan.service.spec.ts`

Contexte : `validateScannerInput` fait `inputSchema.safeParse(raw)` (z.object non-strict) qui **supprime** `extraArgs`. On le retire avant validation, on valide le reste, et on le réattache à l'objet stocké/enqueué.

- [ ] **Step 1: Écrire le test qui échoue**

`apps/api-gateway/src/app/scans/__tests__/extra-args-runscan.service.spec.ts` :

```ts
import { z } from 'zod';
import { ScansService } from '../scans.service';

describe('ScansService — préservation extraArgs', () => {
  it('sépare extraArgs de la validation puis le réattache', () => {
    const svc = Object.create(ScansService.prototype) as ScansService;
    const scanner = { name: 'nmap', inputSchema: z.object({ ports: z.string().optional() }) };
    // méthode privée testée via cast
    const merge = (svc as unknown as {
      mergeValidatedInput: (s: unknown, raw: unknown) => unknown;
    }).mergeValidatedInput.bind(svc);

    const out = merge(scanner, { ports: '80', extraArgs: ['-sC', ''], bogus: 1 });
    expect(out).toEqual({ ports: '80', extraArgs: ['-sC'] });
  });

  it('n’ajoute pas extraArgs quand la liste est vide/absente', () => {
    const svc = Object.create(ScansService.prototype) as ScansService;
    const scanner = { name: 'nmap', inputSchema: z.object({ ports: z.string().optional() }) };
    const merge = (svc as unknown as {
      mergeValidatedInput: (s: unknown, raw: unknown) => unknown;
    }).mergeValidatedInput.bind(svc);
    expect(merge(scanner, { ports: '80' })).toEqual({ ports: '80' });
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `pnpm nx test api-gateway --testFile=extra-args-runscan.service.spec.ts`
Expected: FAIL — `mergeValidatedInput` n'existe pas.

- [ ] **Step 3: Implémenter la séparation/réattache**

Dans `apps/api-gateway/src/app/scans/scans.service.ts` :

Ajouter l'import :

```ts
import { EXTRA_ARGS_KEY, sanitizeExtraArgs } from '@autoscanner/scanner-sdk';
```

Ajouter une méthode privée (près de `validateScannerInput`) :

```ts
/**
 * Valide les options connues contre le schéma du scanner, tout en préservant la
 * clé hors-schéma `extraArgs` (arguments bruts) que z.object supprimerait sinon.
 */
private mergeValidatedInput(
  scanner: Parameters<ScansService['validateScannerInput']>[0],
  raw: unknown,
): unknown {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const { [EXTRA_ARGS_KEY]: rawExtra, ...known } = record;
  const validated = this.validateScannerInput(scanner, known) as Record<string, unknown>;
  const extraArgs = sanitizeExtraArgs(rawExtra);
  return extraArgs.length ? { ...validated, [EXTRA_ARGS_KEY]: extraArgs } : validated;
}
```

Remplacer l'appel dans `runScan` (ligne 81) :

```ts
const parsedInput = this.mergeValidatedInput(scanner, rawOptions);
```

- [ ] **Step 4: Vérifier le succès**

Run: `pnpm nx test api-gateway --testFile=extra-args-runscan.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/app/scans/scans.service.ts apps/api-gateway/src/app/scans/__tests__/extra-args-runscan.service.spec.ts
git commit -m "feat(api): preserve extraArgs through runScan validation"
```

---

## Task 3 : le scan-worker injecte `extraArgs` dans la commande

**Files:**
- Modify: `apps/scan-worker/src/app/scan-job.processor.ts`

Contexte : `scanner.inputSchema.parse(payload.input)` supprime `extraArgs` de `parsedInput` — on le relit donc depuis le `payload.input` **brut** et on l'injecte dans `build.cmd`.

- [ ] **Step 1: Importer les helpers**

Modifier l'import scanner-sdk (ligne 24) :

```ts
import { injectExtraArgs, sanitizeExtraArgs, ScannerRegistry } from '@autoscanner/scanner-sdk';
```

- [ ] **Step 2: Calculer + injecter**

Juste après `const build = scanner.build(parsedInput, payload.target, { ... });` (≈ ligne 250), ajouter :

```ts
const extraArgs = sanitizeExtraArgs(
  (payload.input as Record<string, unknown> | undefined)?.['extraArgs'],
);
const finalCmd = injectExtraArgs(build.cmd, extraArgs);
if (extraArgs.length) {
  this.logger.log(`scanJob=${payload.scanJobId} extraArgs=${JSON.stringify(extraArgs)}`);
}
```

Puis, dans `runSpec`, remplacer `cmd: build.cmd,` par :

```ts
        cmd: finalCmd,
```

- [ ] **Step 3: Type-check + lint**

Run: `pnpm nx type-check scan-worker && pnpm nx lint scan-worker`
Expected: PASS. (La logique de découpage/bornage est déjà couverte par les tests unitaires de la Task 1.)

- [ ] **Step 4: Commit**

```bash
git add apps/scan-worker/src/app/scan-job.processor.ts
git commit -m "feat(scan-worker): inject extraArgs into docker command centrally"
```

---

## Task 4 : `ScannerPreset` + exposition catalogue

**Files:**
- Modify: `libs/scanner-sdk/src/types.ts`
- Modify: `apps/api-gateway/src/app/tools/dto/scanner-catalog.object.ts`
- Modify: `apps/api-gateway/src/app/tools/scanner-catalog.service.ts`
- Test: `apps/api-gateway/src/app/tools/__tests__/scanner-catalog.service.spec.ts` (ajout d'un cas)

- [ ] **Step 1: Ajouter le type au contrat**

Dans `libs/scanner-sdk/src/types.ts`, ajouter avant `ScannerDefinition` :

```ts
/** Recette pré-remplie d'options pour un scanner (« commande couramment lancée »). */
export interface ScannerPreset {
  /** Identifiant stable, kebab-case (ex. 'quick-top-1000'). */
  id: string;
  /** Libellé court affiché sur la chip. */
  name: string;
  /** Explication de ce que fait cette recette (le « pourquoi »). */
  description: string;
  /** Options pré-remplies — clés du inputSchema et/ou `extraArgs`. */
  options: Record<string, unknown>;
}
```

Dans l'interface `ScannerDefinition`, après `produces` :

```ts
  /** Recettes d'options couramment utilisées, proposées dans l'UI. */
  presets?: ScannerPreset[];
```

- [ ] **Step 2: Ajouter un test catalogue**

Dans `apps/api-gateway/src/app/tools/__tests__/scanner-catalog.service.spec.ts` :

```ts
it('expose presets (tableau, vide par défaut)', () => {
  const entries = service.catalog();
  expect(entries.every((e) => Array.isArray(e.presets))).toBe(true);
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `pnpm nx test api-gateway --testFile=scanner-catalog.service.spec.ts`
Expected: FAIL — `presets` non présent.

- [ ] **Step 4: Champ GraphQL + peuplement**

Dans `apps/api-gateway/src/app/tools/dto/scanner-catalog.object.ts`, dans `ScannerCatalogEntryObject`, ajouter (le fichier importe déjà `GraphQLJSON`) :

```ts
  @Field(() => GraphQLJSON, { nullable: true }) presets?: unknown;
```

Dans `apps/api-gateway/src/app/tools/scanner-catalog.service.ts`, dans le `.map(...)`, ajouter :

```ts
        presets: scanner.presets ?? [],
```

- [ ] **Step 5: Vérifier le succès**

Run: `pnpm nx test api-gateway --testFile=scanner-catalog.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/scanner-sdk/src/types.ts apps/api-gateway/src/app/tools/dto/scanner-catalog.object.ts apps/api-gateway/src/app/tools/scanner-catalog.service.ts apps/api-gateway/src/app/tools/__tests__/scanner-catalog.service.spec.ts
git commit -m "feat: add ScannerPreset contract and catalog exposure"
```

---

## Task 5 : enrichir ffuf (champs typés + presets) — patron de référence

**Files:**
- Modify: `libs/scanners/ffuf/src/ffuf.scanner.ts`
- Test: `libs/scanners/ffuf/src/__tests__/ffuf-options.spec.ts`

Ce patron (champs `.describe()` + `presets`) est reproduit ensuite pour les autres outils du top (Task 6).

- [ ] **Step 1: Écrire le test qui échoue**

`libs/scanners/ffuf/src/__tests__/ffuf-options.spec.ts` :

```ts
import { FfufScanner } from '../ffuf.scanner';

describe('ffuf options enrichies', () => {
  it('expose threads/extensions et des presets', () => {
    const shape = (FfufScanner.inputSchema as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape.threads).toBeDefined();
    expect(shape.extensions).toBeDefined();
    expect(FfufScanner.presets?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('build applique threads et extensions', () => {
    const res = FfufScanner.build(
      { wordlist: '/w.txt', matchCodes: '200', threads: 80, extensions: 'php,html' } as never,
      'ex.com',
      { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' },
    );
    expect(res.cmd).toContain('-t');
    expect(res.cmd).toContain('80');
    expect(res.cmd).toContain('-e');
    expect(res.cmd).toContain('php,html');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `pnpm nx test ffuf --testFile=ffuf-options.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Enrichir le scanner**

Remplacer `libs/scanners/ffuf/src/ffuf.scanner.ts` par :

```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const FfufInput = z.object({
  wordlist: z
    .string()
    .default('/etc/ffuf/content.txt')
    .describe('Chemin de la wordlist dans le conteneur.'),
  matchCodes: z
    .string()
    .default('200,204,301,302,307,401,403')
    .describe('Codes HTTP considérés comme des correspondances (-mc).'),
  threads: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Nombre de threads concurrents (-t). Défaut ffuf : 40.'),
  extensions: z
    .string()
    .optional()
    .describe('Extensions à fuzzer, séparées par des virgules (-e), ex. php,html,js.'),
});
export type FfufInputType = z.infer<typeof FfufInput>;

export const FfufScanner: ScannerDefinition<FfufInputType> = {
  name: 'ffuf',
  displayName: 'ffuf',
  category: [ScannerCategory.WEB_ENUM],
  description:
    'Directory/content fuzzing (ffuf) with a small bundled wordlist. Custom-built image.',
  inputSchema: FfufInput,
  docker: {
    image: 'autoscanner/ffuf:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const cmd = [
      'ffuf',
      '-u',
      `https://${target}/FUZZ`,
      '-w',
      input.wordlist,
      '-mc',
      input.matchCodes,
    ];
    if (input.threads) cmd.push('-t', String(input.threads));
    if (input.extensions) cmd.push('-e', input.extensions);
    cmd.push('-of', 'json', '-o', '/dev/stdout', '-s');
    return { cmd };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'ffuf-json' }],
  produces: ['Endpoint'],
  presets: [
    {
      id: 'quick-common',
      name: 'Rapide (codes courants)',
      description: 'Fuzzing de contenu avec les codes 200/301/302/401/403, 40 threads.',
      options: { matchCodes: '200,301,302,401,403' },
    },
    {
      id: 'files-ext',
      name: 'Fichiers (php/html/js)',
      description: 'Cherche des fichiers avec extensions communes, 80 threads.',
      options: { extensions: 'php,html,js,txt', threads: 80 },
    },
    {
      id: 'aggressive',
      name: 'Agressif (200 threads)',
      description: 'Débit maximal — à réserver aux cibles autorisées et robustes.',
      options: { threads: 200 },
    },
  ],
};
```

- [ ] **Step 4: Vérifier le succès**

Run: `pnpm nx test ffuf --testFile=ffuf-options.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/scanners/ffuf/src/ffuf.scanner.ts libs/scanners/ffuf/src/__tests__/ffuf-options.spec.ts
git commit -m "feat(ffuf): typed options (threads/extensions) + curated presets"
```

---

## Task 6 : reproduire l'enrichissement sur le reste du top

**Files (une sous-étape par scanner, même patron que Task 5) :**
- `libs/scanners/nmap/src/nmap.scanner.ts` (déjà des champs typés — **ajouter seulement `presets`**)
- `libs/scanners/nuclei/src/nuclei.scanner.ts` (**ajouter `presets`** ; champs déjà `.describe()`)
- `libs/scanners/httpx/src/httpx.scanner.ts` (**ajouter `presets`** ; champs déjà `.describe()`)
- `libs/scanners/gobuster/src/gobuster.scanner.ts` (**champs typés + presets**)
- `libs/scanners/sqlmap/src/sqlmap.scanner.ts` (**champs typés + presets**) — si `libs/scanners/sqlmap/` n'existe pas, retirer de la liste et le noter.

Pour chaque scanner, appliquer le cycle TDD du patron : (a) écrire un `*-options.spec.ts` vérifiant `presets.length >= 2` et, si des champs sont ajoutés, que `build` les applique ; (b) lancer → FAIL ; (c) ajouter `presets` (et champs `.describe()` si absents, en gardant le `build` rétro-compatible : chaque nouvelle option est `.optional()` et le `build` ne l'utilise que si définie) ; (d) lancer → PASS ; (e) commit.

Presets à poser (options = clés du inputSchema du scanner) :

- [ ] **Step nmap** — presets :
  - `quick-top-1000` — « Scan TCP rapide top-1000 + versions » — `{ serviceDetection: true, timingTemplate: 4 }`
  - `full-tcp-scripts` — « TCP complet + scripts par défaut + OS » — `{ ports: '1-65535', serviceDetection: true, osDetection: true, scripts: ['default'] }`
  - `udp-top-100` — « UDP top-100 » — `{ extraArgs: ['-sU', '--top-ports', '100'] }`

  (Vérifier les noms exacts des champs dans `nmap.scanner.ts` : `ports`, `serviceDetection`, `osDetection`, `timingTemplate`, `scripts` — cf. lecture du fichier ; ajuster si divergence.)

- [ ] **Step nuclei** — presets :
  - `cves-critical-high` — « CVE critiques/high » — `{ severity: ['critical', 'high'], tags: 'cve' }`
  - `exposures` — « Exposition & misconfig » — `{ tags: 'exposure,misconfiguration' }`
  - `tech-detect` — « Détection de technologies » — `{ tags: 'tech' }`

  (Champs `severity` (enum[]), `tags`, `templates` — cf. fichier.)

- [ ] **Step httpx** — presets :
  - `probe-basic` — « Probe HTTP (titres + codes) » — options par défaut, `{}`
  - `full-fingerprint` — « Fingerprint complet (tech + TLS) » — activer les toggles pertinents du schéma httpx (adapter aux 6 champs `.describe()` existants).

- [ ] **Step gobuster** — ajouter champs `threads?` (number 1-100), `extensions?` (string), `wordlist?` (string) en `.optional().describe()` ; `build` push `-t/-x/-w` si définis ; presets `dir-common` / `dns-mode` (adapter au mode gobuster utilisé par le scanner).

- [ ] **Step sqlmap** (si présent) — champs `level?` (1-5), `risk?` (1-3) `.optional()` ; presets `safe-detect` `{ level: 1, risk: 1 }` / `thorough` `{ level: 3, risk: 2 }`.

Note anti-régression : ne jamais rendre un nouveau champ `required` ; tout `build` doit rester valide avec `{}` (cible seule).

- [ ] **Step final: type-check global des scanners touchés**

Run: `pnpm nx run-many -t type-check -p nmap nuclei httpx gobuster ffuf`
Expected: PASS.

---

## Task 7 : formulaire — chips presets + contrôle `extraArgs`

**Files:**
- Modify: `apps/frontend/src/features/scans/scanner-catalog.ts`
- Modify: `apps/frontend/src/lib/graphql/queries.ts`
- Modify: `apps/frontend/src/features/scans/scanner-options-form.tsx`
- Test: `apps/frontend/src/features/scans/__tests__/scanner-options-form-extra.spec.tsx`

- [ ] **Step 1: Type `presets` côté frontend + query**

Dans `apps/frontend/src/features/scans/scanner-catalog.ts`, dans `ScannerCatalogEntry` :

```ts
  presets?: Array<{ id: string; name: string; description: string; options: Record<string, unknown> }>;
```

Dans `apps/frontend/src/lib/graphql/queries.ts`, `SCANNER_CATALOG_QUERY` : ajouter `presets` à la sélection (scalaire JSON, comme `default`).

- [ ] **Step 2: Écrire le test qui échoue**

`apps/frontend/src/features/scans/__tests__/scanner-options-form-extra.spec.tsx` :

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScannerOptionsForm } from '../scanner-options-form';
import type { ScannerCatalogEntry } from '../scanner-catalog';

const entry: ScannerCatalogEntry = {
  name: 'ffuf',
  displayName: 'ffuf',
  description: '',
  categories: ['web-enum'],
  requiresCredential: null,
  fields: [{ name: 'threads', type: 'number', required: false, default: undefined, min: 1, max: 200, enumValues: null, description: 'threads' }],
  presets: [{ id: 'aggr', name: 'Agressif', description: '200 threads', options: { threads: 200 } }],
} as ScannerCatalogEntry;

describe('ScannerOptionsForm — presets & extraArgs', () => {
  it('un clic sur une chip preset émet ses options', () => {
    const onChange = vi.fn();
    render(<ScannerOptionsForm entry={entry} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Agressif/ }));
    const last = onChange.mock.calls.at(-1)?.[0] as string;
    expect(JSON.parse(last)).toMatchObject({ threads: 200 });
  });

  it('le champ arguments bruts alimente extraArgs', () => {
    const onChange = vi.fn();
    render(<ScannerOptionsForm entry={entry} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('extra-args'), { target: { value: '-sC -p 80' } });
    const last = onChange.mock.calls.at(-1)?.[0] as string;
    expect(JSON.parse(last).extraArgs).toEqual(['-sC', '-p', '80']);
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `pnpm nx test frontend --testFile=scanner-options-form-extra.spec.tsx`
Expected: FAIL.

- [ ] **Step 4: Ajouter presets + extraArgs au formulaire**

Dans `apps/frontend/src/features/scans/scanner-options-form.tsx` :

1. Ajouter un état `extraArgsText` :

```tsx
  const [extraArgsText, setExtraArgsText] = useState('');
```

et le réinitialiser dans le `useEffect` de reset (ajouter `setExtraArgsText('')`).

2. Inclure `extraArgs` dans l'émission. Dans le `useEffect` d'émission, avant `onChange(...)` :

```tsx
    const extra = extraArgsText.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (extra.length) options[EXTRA_ARGS_KEY] = extra;
```

(et ajouter `extraArgsText` aux dépendances du `useEffect`). Importer la clé :

```tsx
import { EXTRA_ARGS_KEY } from '@autoscanner/scanner-sdk';
```

3. Appliquer un preset : ajouter un handler qui pousse `preset.options` dans `values`/`enabled` (et, si `preset.options.extraArgs` est un tableau, remplir `extraArgsText`) :

```tsx
  function applyPreset(options: Record<string, unknown>) {
    const { [EXTRA_ARGS_KEY]: presetExtra, ...rest } = options;
    setValues((prev) => ({ ...prev, ...rest }));
    setEnabled((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(rest)) next[key] = true; // active les toggles concernés
      return next;
    });
    if (Array.isArray(presetExtra)) setExtraArgsText((presetExtra as string[]).join(' '));
  }
```

4. Rendu : au-dessus des champs (après le bloc `requiresCredential`), afficher les chips presets et, sous les champs, le contrôle extraArgs. Insérer dans le JSX de retour (le cas `fields.length === 0` doit AUSSI rendre extraArgs — voir note) :

```tsx
      {entry.presets && entry.presets.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="scanner-presets">
          {entry.presets.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.description}
              onClick={() => applyPreset(p.options)}
              className="rounded-full border border-indigo-500/40 px-2 py-0.5 text-xs text-indigo-300 hover:bg-indigo-500/20"
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : null}
```

et le contrôle extraArgs (toujours rendu) :

```tsx
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-200">Arguments bruts</span>
        <input
          type="text"
          aria-label="extra-args"
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm font-mono text-slate-100"
          value={extraArgsText}
          onChange={(e) => setExtraArgsText(e.target.value)}
          placeholder="ex. -sC -p 80 (séparés par des espaces)"
        />
        <span className="text-[10px] text-slate-500">
          Ajoutés tels quels à la commande. Un token = un argument (pas de guillemets).
        </span>
      </label>
```

**Note importante :** aujourd'hui le composant `return` anticipé quand `fields.length === 0`. Restructurer pour que presets + extraArgs s'affichent **même sans champ** : remplacer le early-return par un rendu conditionnel de la liste des champs (afficher le message « pas d'options configurables » à la place des champs, mais toujours rendre presets + extraArgs). L'émission `useEffect` ne dépend plus de `fields.length`.

- [ ] **Step 5: Vérifier le succès**

Run: `pnpm nx test frontend --testFile=scanner-options-form-extra.spec.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/scans/scanner-catalog.ts apps/frontend/src/lib/graphql/queries.ts apps/frontend/src/features/scans/scanner-options-form.tsx apps/frontend/src/features/scans/__tests__/scanner-options-form-extra.spec.tsx
git commit -m "feat(frontend): preset chips + raw extraArgs control in options form"
```

---

## Task 8 : options dans la barre du cockpit

**Files:**
- Modify: `apps/frontend/src/features/cockpit/cockpit-command-bar.tsx`

Contexte : la barre envoie `optionsJson: ''` (ligne 146). On ajoute un panneau d'options dépliable réutilisant `ScannerOptionsForm`.

- [ ] **Step 1: État + import**

Ajouter les imports :

```ts
import { ScannerOptionsForm } from '../scans/scanner-options-form';
```

Ajouter les états dans le composant :

```ts
  const [optionsJson, setOptionsJson] = useState('');
  const [showOptions, setShowOptions] = useState(false);
```

Récupérer l'entrée sélectionnée (le catalogue est déjà chargé dans `catalog`) :

```ts
  const selectedEntry = useMemo(() => catalog.find((e) => e.name === scanner), [catalog, scanner]);
```

- [ ] **Step 2: Passer `optionsJson` à la mutation**

Ligne 145-147, remplacer :

```ts
    const res = await runScan({
      variables: { input: { engagementId, scannerName: scanner, target, optionsJson } },
    });
```

Réinitialiser après lancement : après `setTarget('')` dans `launch()`, ajouter `setOptionsJson('');`.

- [ ] **Step 3: UI dépliable (mode scanner uniquement)**

Dans le bloc `mode === 'scanner'`, après le `<label>` « tous », ajouter un bouton bascule :

```tsx
          <button
            type="button"
            aria-label="toggle-options"
            onClick={() => setShowOptions((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Options {showOptions ? '▲' : '▼'}
          </button>
```

Et, sous la barre (avant la fermeture du conteneur racine), un panneau conditionnel :

```tsx
      {mode === 'scanner' && showOptions ? (
        <div className="w-full basis-full border-t border-space-800 pt-3">
          <ScannerOptionsForm entry={selectedEntry} onChange={setOptionsJson} />
        </div>
      ) : null}
```

- [ ] **Step 4: Type-check + lint**

Run: `pnpm nx type-check frontend && pnpm nx lint frontend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/cockpit/cockpit-command-bar.tsx
git commit -m "feat(frontend): scanner options panel in cockpit command bar"
```

---

## Task 9 : doc Kali cliquable → `extraArgs`

**Files:**
- Modify: `apps/frontend/src/features/scans/kali-tool-doc-panel.tsx`
- Modify: `apps/frontend/src/features/scans/scanner-options-form.tsx`

Objectif : chaque flag documenté du dataset Kali gagne un bouton « + » qui ajoute le flag au champ arguments bruts, avec sa description déjà visible.

- [ ] **Step 1: Prop `onAddFlag` optionnelle**

Dans `apps/frontend/src/features/scans/kali-tool-doc-panel.tsx`, ajouter à la signature du composant une prop optionnelle `onAddFlag?: (flag: string) => void`, et pour chaque option de flag rendue (`options[]` avec `flag`/`argHint`/`description`), ajouter, quand `onAddFlag` est fourni, un bouton :

```tsx
{onAddFlag ? (
  <button
    type="button"
    aria-label={`add-flag-${opt.flag}`}
    onClick={() => onAddFlag(opt.flag)}
    className="ml-2 rounded border border-slate-600 px-1 text-[10px] text-slate-300 hover:bg-slate-700"
  >
    +
  </button>
) : null}
```

Sans `onAddFlag`, le panneau reste en lecture seule (comportement actuel inchangé).

- [ ] **Step 2: Exposer un ajout dans le formulaire**

Dans `ScannerOptionsForm`, exposer une fonction d'ajout via le panneau Kali quand il est rendu à côté. Le plus simple : le formulaire n'embarque pas le panneau Kali (c'est `scan-run-page`/cockpit qui le rend). On expose donc l'append au niveau du parent. Ajouter au formulaire un ajout programmatique en remontant l'action : ajouter une prop optionnelle `registerAddFlag?: (fn: (flag: string) => void) => void` que le formulaire appelle au montage avec un handler qui fait `setExtraArgsText((t) => (t ? t + ' ' : '') + flag)`.

```tsx
  useEffect(() => {
    registerAddFlag?.((flag: string) =>
      setExtraArgsText((t) => (t ? `${t} ${flag}` : flag)),
    );
  }, [registerAddFlag]);
```

- [ ] **Step 3: Câbler dans `scan-run-page.tsx`**

Dans `apps/frontend/src/features/scans/scan-run-page.tsx`, tenir un `useRef<(f: string) => void>()`, le passer à `ScannerOptionsForm` via `registerAddFlag={(fn) => (addFlagRef.current = fn)}`, et au `KaliToolDocPanel` via `onAddFlag={(f) => addFlagRef.current?.(f)}`.

- [ ] **Step 4: Test**

Créer `apps/frontend/src/features/scans/__tests__/kali-add-flag.spec.tsx` : rendre `KaliToolDocPanel` avec un `onAddFlag` mock et un flag simulé (mocker la query `KALI_TOOL_QUERY` avec une option), cliquer sur `add-flag-<flag>`, vérifier l'appel du mock. (Adapter le nom exact de la query Kali au fichier.)

Run: `pnpm nx test frontend --testFile=kali-add-flag.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/scans/kali-tool-doc-panel.tsx apps/frontend/src/features/scans/scanner-options-form.tsx apps/frontend/src/features/scans/scan-run-page.tsx apps/frontend/src/features/scans/__tests__/kali-add-flag.spec.tsx
git commit -m "feat(frontend): click Kali flag to append it to extraArgs"
```

---

## Task 10 : `scannerUsageStats` (top des options réellement lancées)

**Files:**
- Create: `apps/api-gateway/src/app/scans/dto/scanner-usage.object.ts`
- Modify: `apps/api-gateway/src/app/scans/scans.service.ts`
- Modify: `apps/api-gateway/src/app/scans/scans.resolver.ts`
- Modify: `apps/frontend/src/lib/graphql/queries.ts`
- Test: `apps/api-gateway/src/app/scans/__tests__/scanner-usage.service.spec.ts`

Contexte : pas de nouvelle table — on agrège `ScanJob.input` par scanner. Le frontend s'en sert (hybride) pour réordonner/compléter les presets.

- [ ] **Step 1: ObjectType**

`apps/api-gateway/src/app/scans/dto/scanner-usage.object.ts` :

```ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ScannerUsageStat {
  /** Combinaison d'options normalisée (JSON trié), '' pour « aucune option ». */
  @Field() optionsJson!: string;
  @Field(() => Int) count!: number;
}
```

- [ ] **Step 2: Écrire le test qui échoue**

`apps/api-gateway/src/app/scans/__tests__/scanner-usage.service.spec.ts` :

```ts
import { ScansService } from '../scans.service';

describe('ScansService.scannerUsageStats', () => {
  it('agrège et trie par fréquence les combinaisons d’options', async () => {
    const rows = [
      { input: { ports: '80' } },
      { input: { ports: '80' } },
      { input: { ports: '1-65535' } },
      { input: {} },
    ];
    const prisma = { scanJob: { findMany: jest.fn().mockResolvedValue(rows) } };
    const svc = Object.create(ScansService.prototype) as ScansService;
    (svc as unknown as { prisma: unknown }).prisma = prisma;
    const stats = await svc.scannerUsageStats('u1', 'nmap');
    expect(stats[0]).toEqual({ optionsJson: JSON.stringify({ ports: '80' }), count: 2 });
    expect(stats.find((s) => s.optionsJson === '')?.count).toBe(1);
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `pnpm nx test api-gateway --testFile=scanner-usage.service.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Implémenter l'agrégation**

Dans `apps/api-gateway/src/app/scans/scans.service.ts`, ajouter :

```ts
/**
 * Top des combinaisons d'options réellement lancées pour un scanner (agrégé de
 * l'historique `ScanJob.input`). Normalise les clés (tri) et retire `extraArgs`
 * du regroupement pour ne pas fragmenter les stats. Renvoie les 10 plus fréquentes.
 */
async scannerUsageStats(
  userId: string,
  scannerName: string,
): Promise<Array<{ optionsJson: string; count: number }>> {
  const jobs = await this.prisma.scanJob.findMany({
    where: { scannerName, scan: { engagement: { ownerId: userId, deletedAt: null } } },
    select: { input: true },
    take: 1000,
    orderBy: { queuedAt: 'desc' },
  });
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const raw = (job.input ?? {}) as Record<string, unknown>;
    const { extraArgs: _drop, ...known } = raw;
    const sortedKeys = Object.keys(known).sort();
    const normalized = sortedKeys.length
      ? JSON.stringify(Object.fromEntries(sortedKeys.map((k) => [k, known[k]])))
      : '';
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([optionsJson, count]) => ({ optionsJson, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
```

- [ ] **Step 5: Query resolver**

Dans `apps/api-gateway/src/app/scans/scans.resolver.ts`, importer `ScannerUsageStat` et ajouter dans `ScansResolver` :

```ts
@Query(() => [ScannerUsageStat], { name: 'scannerUsageStats' })
scannerUsageStats(
  @CurrentUser() user: User,
  @Args('scannerName') scannerName: string,
): Promise<ScannerUsageStat[]> {
  return this.svc.scannerUsageStats(user.id, scannerName) as Promise<ScannerUsageStat[]>;
}
```

- [ ] **Step 6: Query frontend**

Dans `apps/frontend/src/lib/graphql/queries.ts`, ajouter :

```ts
export const SCANNER_USAGE_STATS_QUERY = gql`
  query ScannerUsageStats($scannerName: String!) {
    scannerUsageStats(scannerName: $scannerName) {
      optionsJson
      count
    }
  }
`;
```

- [ ] **Step 7: Vérifier + type-check**

Run: `pnpm nx test api-gateway --testFile=scanner-usage.service.spec.ts && pnpm nx type-check api-gateway`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api-gateway/src/app/scans/dto/scanner-usage.object.ts apps/api-gateway/src/app/scans/scans.service.ts apps/api-gateway/src/app/scans/scans.resolver.ts apps/frontend/src/lib/graphql/queries.ts apps/api-gateway/src/app/scans/__tests__/scanner-usage.service.spec.ts
git commit -m "feat: scannerUsageStats aggregated from ScanJob history"
```

---

## Task 11 : afficher les stats d'usage dans le formulaire (hybride)

**Files:**
- Modify: `apps/frontend/src/features/scans/scanner-options-form.tsx`

- [ ] **Step 1: Charger et proposer les combinaisons fréquentes**

Dans `ScannerOptionsForm`, quand `entry` est défini, exécuter `useQuery(SCANNER_USAGE_STATS_QUERY, { variables: { scannerName: entry.name }, skip: !entry })`. Rendre, sous les chips presets, une ligne « Souvent lancé » avec des chips issues des stats (parser `optionsJson`, ignorer les entrées vides), chaque chip appelant `applyPreset(JSON.parse(optionsJson))`. Limiter à 5.

```tsx
      {usage.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="scanner-usage">
          <span className="text-[10px] uppercase text-slate-500">Souvent lancé</span>
          {usage.slice(0, 5).map((u) => (
            <button
              key={u.optionsJson}
              type="button"
              onClick={() => applyPreset(JSON.parse(u.optionsJson))}
              className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-700"
            >
              {u.count}× {u.optionsJson}
            </button>
          ))}
        </div>
      ) : null}
```

où `usage` filtre les `optionsJson` non vides du résultat de la query.

- [ ] **Step 2: Type-check + test de rendu**

Run: `pnpm nx type-check frontend`
Expected: PASS. (Le rendu est couvert par un mock Apollo si un test est ajouté ; sinon type-check suffit ici.)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/scans/scanner-options-form.tsx
git commit -m "feat(frontend): surface frequently-used option combos in options form"
```

---

## Task 12 : Vérification end-to-end (manuelle)

**Files:** aucun (validation)

- [ ] **Step 1: Démarrer l'app** (`pnpm dev:up`, `pnpm dev:workers`, `pnpm nx serve api-gateway`, `pnpm nx serve frontend`).

- [ ] **Step 2: Depuis le cockpit**, sélectionner `nmap`, déplier **Options**, choisir un preset (ex. « TCP complet + scripts + OS »), lancer. Vérifier dans les logs du worker la ligne `extraArgs=...` si le preset en pose, et que la commande docker reflète les options.

- [ ] **Step 3: Arguments bruts** — saisir `-sV --top-ports 50`, lancer, vérifier que ffuf/nmap reçoit bien les flags (via les logs persistés du Plan 1).

- [ ] **Step 4: Presets & explications** — survoler une chip preset affiche sa description ; le panneau Kali liste les flags avec descriptions ; cliquer « + » sur un flag l'ajoute au champ arguments bruts.

- [ ] **Step 5: Stats d'usage** — après plusieurs runs d'un scanner, la ligne « Souvent lancé » propose les combinaisons les plus fréquentes.

- [ ] **Step 6: Suite de tests**

Run: `pnpm nx test scanner-sdk && pnpm nx test api-gateway && pnpm nx test frontend && pnpm nx run-many -t type-check -p scan-worker api-gateway frontend`
Expected: vert.

---

## Self-review (fait à l'écriture)

- **Couverture spec §3** : options dans le cockpit ✔ (T8), `extraArgs` universel central ✔ (T1-T3), sélecteur de flags Kali → extraArgs ✔ (T9), champs typés top outils ✔ (T5-T6), presets curés ✔ (T4-T6) rendus en chips ✔ (T7), télémétrie d'usage agrégée sans table ✔ (T10-T11), explication commande/flags ✔ (T7 descriptions + T9 doc Kali).
- **Placeholders** : le code est fourni. Les points « adapter au fichier » (httpx/gobuster/sqlmap champs exacts, nom de la query Kali) sont des vérifications ciblées, pas des blancs — le patron complet est donné en T5.
- **Cohérence des noms** : `EXTRA_ARGS_KEY`/`extraArgs`, `sanitizeExtraArgs`, `injectExtraArgs`, `ScannerPreset`, `applyPreset`, `scannerUsageStats`, `ScannerUsageStat` — constants d'une tâche à l'autre.
- **Compat** : tout nouveau champ Zod est `.optional()` ; `build` reste valide avec la cible seule ; `extraArgs` voyage hors schéma (préservé T2, injecté T3). Aucune migration Prisma.
- **Risque connu (documenté)** : `injectExtraArgs` place les flags après le binaire ; un outil exigeant un ordre positionnel strict peut nécessiter un preset dédié plutôt que des flags bruts.
```
