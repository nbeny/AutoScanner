# Plan 2 — Fondation catégorie + séparation OSINT / Recon (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire de la **catégorie primaire** du scanner la source de vérité OSINT/Recon, puis s'en servir pour (a) que le launcher Recon n'affiche plus les scanners OSINT et (b) que chaque page (Recon / OSINT) ne montre que ses propres jobs.

**Architecture:** On ajoute `primaryCategory` au contrat scanner, exposé dans le catalogue GraphQL. Un helper `isOsintScanner` (ensemble de catégories OSINT) partagé backend, et son miroir frontend `isOsintEntry`. Le launcher Recon exclut les entrées OSINT. Un filtre serveur `group: OSINT | RECON` sur `allScans` (mappé via le `ScannerRegistry`) sépare les listes de jobs.

**Tech Stack:** NestJS 11 GraphQL code-first, Zod, Prisma, React + Apollo, Vitest (frontend) / Jest (backend) via `pnpm nx test <project>`.

**Référence spec:** `docs/superpowers/specs/2026-08-09-osint-recon-logs-scanner-options-design.md` § Fondation partagée + Section 1.

**Prérequis:** aucun (indépendant du Plan 1). À exécuter après le Plan 1 par simple cohérence de séquence.

---

## Structure des fichiers

| Fichier | Rôle | Action |
| --- | --- | --- |
| `libs/scanner-sdk/src/types.ts` | Champ `primaryCategory?` sur `ScannerDefinition` | Modify |
| `libs/scanner-sdk/src/osint-categories.ts` | `OSINT_CATEGORY_SET`, `primaryCategoryOf`, `isOsintScanner` | Create |
| `libs/scanner-sdk/src/registry.ts` | Méthode `osintScannerNames()` | Modify |
| `libs/scanner-sdk/src/index.ts` | Export du nouveau module | Modify |
| `apps/api-gateway/src/app/tools/dto/scanner-catalog.object.ts` | Champ GraphQL `primaryCategory` | Modify |
| `apps/api-gateway/src/app/tools/scanner-catalog.service.ts` | Peupler `primaryCategory` | Modify |
| `apps/api-gateway/src/app/scans/dto/scan-group.enum.ts` | Enum `ScanGroup` | Create |
| `apps/api-gateway/src/app/scans/dto/scans-filter.input.ts` | Champ `group?` | Modify |
| `apps/api-gateway/src/app/scans/scans.service.ts` | Filtre `group` dans `listAllForOwner` | Modify |
| `apps/api-gateway/src/app/osint/__tests__/osint-presets-are-osint.spec.ts` | Garde : presets OSINT ⊂ catégories OSINT | Create |
| `apps/frontend/src/features/scans/scanner-catalog.ts` | `primaryCategory` sur l'entrée + `isOsintEntry` | Modify |
| `apps/frontend/src/lib/graphql/queries.ts` | `primaryCategory` dans la query catalogue + `group` dans ALL_SCANS | Modify |
| `apps/frontend/src/features/cockpit/cockpit-command-bar.tsx` | Exclure OSINT du launcher Recon | Modify |
| `apps/frontend/src/features/cockpit/use-active-scanners.ts` | Param `group` | Modify |
| `apps/frontend/src/features/cockpit/active-scanners-list.tsx` | Prop `group` | Modify |
| `apps/frontend/src/features/cockpit/cockpit-page.tsx` | `group="RECON"` | Modify |
| `apps/frontend/src/features/osint/osint-cockpit-page.tsx` | `group="OSINT"` | Modify |

**Noms figés :** `OSINT_CATEGORY_SET`, `primaryCategoryOf(def)`, `isOsintScanner(def)`, `osintScannerNames()`, enum `ScanGroup { OSINT, RECON }`, helper frontend `isOsintEntry(entry)`.

**Hors périmètre (décidé) :** `FindingsFluxFeed` reste partagé (les findings sont transverses, pas rattachés à un groupe OSINT/Recon) ; le launcher OSINT reste piloté par les seed-presets existants (déjà limité à des scanners OSINT — la Task 8 le verrouille par test).

---

## Task 1 : `primaryCategory` + helpers OSINT (scanner-sdk)

**Files:**
- Modify: `libs/scanner-sdk/src/types.ts`
- Create: `libs/scanner-sdk/src/osint-categories.ts`
- Modify: `libs/scanner-sdk/src/registry.ts`
- Modify: `libs/scanner-sdk/src/index.ts`
- Test: `libs/scanner-sdk/src/__tests__/osint-categories.spec.ts`

- [ ] **Step 1: Écrire le test qui échoue**

`libs/scanner-sdk/src/__tests__/osint-categories.spec.ts` :

```ts
import { ScannerCategory } from '../types';
import { primaryCategoryOf, isOsintScanner, OSINT_CATEGORY_SET } from '../osint-categories';
import type { ScannerDefinition } from '../types';

function def(partial: Partial<ScannerDefinition>): ScannerDefinition {
  return { name: 'x', category: [], ...(partial as object) } as ScannerDefinition;
}

describe('osint-categories', () => {
  it('primaryCategoryOf préfère primaryCategory, sinon category[0]', () => {
    expect(primaryCategoryOf(def({ primaryCategory: ScannerCategory.OSINT }))).toBe('osint');
    expect(
      primaryCategoryOf(def({ category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.PASSIVE_RECON] })),
    ).toBe('subdomain-enum');
  });

  it('isOsintScanner vrai seulement si la catégorie primaire est OSINT', () => {
    expect(isOsintScanner(def({ primaryCategory: ScannerCategory.BREACH_INTEL }))).toBe(true);
    // primaire = subdomain-enum (recon actif) même si passive-recon est présent
    expect(
      isOsintScanner(def({ category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.PASSIVE_RECON] })),
    ).toBe(false);
    // primaire = passive-recon → OSINT
    expect(isOsintScanner(def({ category: [ScannerCategory.PASSIVE_RECON] }))).toBe(true);
  });

  it('un scanner sans catégorie tombe en non-OSINT (fail-safe recon)', () => {
    expect(isOsintScanner(def({ category: [] }))).toBe(false);
  });

  it('OSINT_CATEGORY_SET couvre les 4 catégories OSINT', () => {
    expect([...OSINT_CATEGORY_SET].sort()).toEqual(
      ['breach-intel', 'identity-osint', 'osint', 'passive-recon'].sort(),
    );
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `pnpm nx test scanner-sdk --testFile=osint-categories.spec.ts`
Expected: FAIL — `Cannot find module '../osint-categories'`.

- [ ] **Step 3: Ajouter `primaryCategory` au contrat**

Dans `libs/scanner-sdk/src/types.ts`, dans l'interface `ScannerDefinition`, ajouter après `category: ScannerCategory[];` (ligne 115) :

```ts
  /**
   * Catégorie « primaire » du scanner — décide son groupe OSINT/Recon dans l'UI.
   * Absent ⇒ on prend `category[0]`. Poser explicitement pour les outils
   * dual-taggés dont la 1re catégorie n'est pas la vraie intention (ex. un outil
   * passif listé d'abord en `subdomain-enum`).
   */
  primaryCategory?: ScannerCategory;
```

- [ ] **Step 4: Créer le module OSINT**

`libs/scanner-sdk/src/osint-categories.ts` :

```ts
import { ScannerCategory } from './types';
import type { ScannerDefinition } from './types';

/** Catégories dont la présence en position primaire fait basculer un scanner en OSINT. */
export const OSINT_CATEGORY_SET: ReadonlySet<ScannerCategory> = new Set([
  ScannerCategory.OSINT,
  ScannerCategory.IDENTITY_OSINT,
  ScannerCategory.PASSIVE_RECON,
  ScannerCategory.BREACH_INTEL,
]);

/** Catégorie primaire effective : `primaryCategory` sinon `category[0]` (ou null). */
export function primaryCategoryOf(def: Pick<ScannerDefinition, 'primaryCategory' | 'category'>):
  | ScannerCategory
  | null {
  return def.primaryCategory ?? def.category[0] ?? null;
}

/** Vrai si la catégorie primaire du scanner est OSINT. Fail-safe : sans catégorie ⇒ recon. */
export function isOsintScanner(def: Pick<ScannerDefinition, 'primaryCategory' | 'category'>): boolean {
  const primary = primaryCategoryOf(def);
  return primary !== null && OSINT_CATEGORY_SET.has(primary);
}
```

- [ ] **Step 5: Ajouter `osintScannerNames()` au registry**

Dans `libs/scanner-sdk/src/registry.ts`, ajouter l'import en tête :

```ts
import { isOsintScanner } from './osint-categories';
```

Et la méthode dans la classe (après `list`) :

```ts
/** Noms des scanners dont la catégorie primaire est OSINT. */
osintScannerNames(): string[] {
  return Array.from(this.scanners.values())
    .filter((s) => isOsintScanner(s))
    .map((s) => s.name);
}
```

- [ ] **Step 6: Exporter depuis l'index**

Dans `libs/scanner-sdk/src/index.ts`, ajouter :

```ts
export * from './osint-categories';
```

- [ ] **Step 7: Lancer le test pour vérifier le succès**

Run: `pnpm nx test scanner-sdk --testFile=osint-categories.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add libs/scanner-sdk/src/types.ts libs/scanner-sdk/src/osint-categories.ts libs/scanner-sdk/src/registry.ts libs/scanner-sdk/src/index.ts libs/scanner-sdk/src/__tests__/osint-categories.spec.ts
git commit -m "feat(scanner-sdk): primaryCategory + isOsintScanner source of truth"
```

---

## Task 2 : exposer `primaryCategory` dans le catalogue GraphQL

**Files:**
- Modify: `apps/api-gateway/src/app/tools/dto/scanner-catalog.object.ts`
- Modify: `apps/api-gateway/src/app/tools/scanner-catalog.service.ts`
- Test: `apps/api-gateway/src/app/tools/__tests__/scanner-catalog.service.spec.ts` (existe déjà — on y ajoute un cas)

- [ ] **Step 1: Ajouter un test sur `primaryCategory`**

Dans `apps/api-gateway/src/app/tools/__tests__/scanner-catalog.service.spec.ts`, ajouter un cas (adapter au style du fichier ; le registre y est déjà monté) :

```ts
it('expose primaryCategory (primaryCategory sinon category[0])', () => {
  const entries = service.catalog();
  const nmap = entries.find((e) => e.name === 'nmap');
  expect(nmap?.primaryCategory).toBeTruthy();
  // toute entrée a une primaryCategory non nulle (chaque scanner a >=1 catégorie)
  expect(entries.every((e) => typeof e.primaryCategory === 'string')).toBe(true);
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `pnpm nx test api-gateway --testFile=scanner-catalog.service.spec.ts`
Expected: FAIL — `primaryCategory` absent des entrées.

- [ ] **Step 3: Ajouter le champ GraphQL**

Dans `apps/api-gateway/src/app/tools/dto/scanner-catalog.object.ts`, dans `ScannerCatalogEntryObject`, après `categories` (ligne 22) :

```ts
  @Field(() => String, { nullable: true }) primaryCategory?: string | null;
```

- [ ] **Step 4: Peupler dans le service**

Dans `apps/api-gateway/src/app/tools/scanner-catalog.service.ts` :

Ajouter à l'import scanner-sdk (ligne 2) :

```ts
import { describeScannerInput, primaryCategoryOf, ScannerRegistry } from '@autoscanner/scanner-sdk';
```

Dans le `.map(...)`, après `categories: scanner.category,` :

```ts
        primaryCategory: primaryCategoryOf(scanner),
```

- [ ] **Step 5: Lancer le test pour vérifier le succès**

Run: `pnpm nx test api-gateway --testFile=scanner-catalog.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/app/tools/dto/scanner-catalog.object.ts apps/api-gateway/src/app/tools/scanner-catalog.service.ts apps/api-gateway/src/app/tools/__tests__/scanner-catalog.service.spec.ts
git commit -m "feat(api): expose primaryCategory in scanner catalog"
```

---

## Task 3 : helper frontend `isOsintEntry` + query

**Files:**
- Modify: `apps/frontend/src/features/scans/scanner-catalog.ts`
- Modify: `apps/frontend/src/lib/graphql/queries.ts`
- Test: `apps/frontend/src/features/scans/__tests__/is-osint-entry.spec.ts`

- [ ] **Step 1: Écrire le test qui échoue**

`apps/frontend/src/features/scans/__tests__/is-osint-entry.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { isOsintEntry, type ScannerCatalogEntry } from '../scanner-catalog';

const entry = (p: Partial<ScannerCatalogEntry>): ScannerCatalogEntry =>
  ({
    name: 'x',
    displayName: 'x',
    description: '',
    categories: [],
    requiresCredential: null,
    fields: [],
    ...p,
  }) as ScannerCatalogEntry;

describe('isOsintEntry', () => {
  it('vrai quand primaryCategory est une catégorie OSINT', () => {
    expect(isOsintEntry(entry({ primaryCategory: 'osint' }))).toBe(true);
    expect(isOsintEntry(entry({ primaryCategory: 'breach-intel' }))).toBe(true);
  });
  it('faux pour une catégorie recon', () => {
    expect(isOsintEntry(entry({ primaryCategory: 'port-scan' }))).toBe(false);
  });
  it('fallback sur categories[0] si primaryCategory absent', () => {
    expect(isOsintEntry(entry({ categories: ['passive-recon'] }))).toBe(true);
    expect(isOsintEntry(entry({ categories: ['subdomain-enum', 'passive-recon'] }))).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `pnpm nx test frontend --testFile=is-osint-entry.spec.ts`
Expected: FAIL — `isOsintEntry` non exporté.

- [ ] **Step 3: Étendre l'interface + helper**

Dans `apps/frontend/src/features/scans/scanner-catalog.ts` :

Dans l'interface `ScannerCatalogEntry` (après `categories: string[];`, ligne 98) :

```ts
  /** Catégorie primaire (source de vérité OSINT/Recon), null si non fournie. */
  primaryCategory?: string | null;
```

En bas du fichier, ajouter :

```ts
/** Catégories brutes qui, en position primaire, font basculer une entrée en OSINT. */
export const OSINT_RAW_CATEGORIES: ReadonlySet<string> = new Set([
  'osint',
  'identity-osint',
  'passive-recon',
  'breach-intel',
]);

/** Une entrée est OSINT si sa catégorie primaire (primaryCategory sinon categories[0]) est OSINT. */
export function isOsintEntry(entry: Pick<ScannerCatalogEntry, 'primaryCategory' | 'categories'>): boolean {
  const primary = entry.primaryCategory ?? entry.categories[0] ?? null;
  return primary !== null && OSINT_RAW_CATEGORIES.has(primary);
}
```

- [ ] **Step 4: Demander `primaryCategory` dans la query catalogue**

Dans `apps/frontend/src/lib/graphql/queries.ts`, dans `SCANNER_CATALOG_QUERY`, ajouter le champ `primaryCategory` à côté de `categories` dans la sélection.

- [ ] **Step 5: Lancer le test pour vérifier le succès**

Run: `pnpm nx test frontend --testFile=is-osint-entry.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/scans/scanner-catalog.ts apps/frontend/src/lib/graphql/queries.ts apps/frontend/src/features/scans/__tests__/is-osint-entry.spec.ts
git commit -m "feat(frontend): isOsintEntry helper + primaryCategory in catalog query"
```

---

## Task 4 : le launcher Recon exclut les scanners OSINT

**Files:**
- Modify: `apps/frontend/src/features/cockpit/cockpit-command-bar.tsx`

- [ ] **Step 1: Retirer 'OSINT' de l'ordre des catégories**

Dans `CATEGORY_ORDER` (lignes 21-31), supprimer la ligne `'OSINT',`. Le tableau devient :

```ts
const CATEGORY_ORDER: Category[] = [
  'DNS/Subdomains',
  'Ports/Network',
  'Web/HTTP',
  'TLS',
  'Cloud',
  'Active Directory',
  'Vuln/Exploit',
  'Other',
];
```

- [ ] **Step 2: Exclure les entrées OSINT du groupement**

Importer le helper (ligne 12-18, bloc d'import scanner-catalog) — ajouter `isOsintEntry` :

```ts
import {
  acceptsTarget,
  detectTargetType,
  groupForCategories,
  isOsintEntry,
  type Category,
  type ScannerCatalogEntry,
} from '../scans/scanner-catalog';
```

Dans le `useMemo` `groupedScanners` (ligne 93-106), au début de la boucle `for`, ajouter l'exclusion OSINT (avant le filtre `acceptsTarget`) :

```ts
for (const entry of catalog) {
  if (isOsintEntry(entry)) continue; // le launcher Recon ne propose jamais d'OSINT
  if (!showAll && !acceptsTarget(entry.name, detected)) continue;
  const cat = groupForCategories(entry.categories);
  if (!groups.has(cat)) groups.set(cat, []);
  groups.get(cat)!.push(entry);
}
```

Note : `showAll` continue de désactiver le filtre de *cible*, mais l'exclusion OSINT est **au-dessus** de `showAll` — cocher « tous » ne réintroduit plus l'OSINT. C'est voulu.

- [ ] **Step 3: Test de non-régression (le launcher Recon ne liste aucun OSINT)**

Créer `apps/frontend/src/features/cockpit/__tests__/cockpit-command-bar-osint.spec.tsx` :

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { CockpitCommandBar } from '../cockpit-command-bar';
import { SCANNER_CATALOG_QUERY, SCAN_TEMPLATES_QUERY } from '../../../lib/graphql/queries';

const catalog = [
  { name: 'nmap', displayName: 'nmap', description: '', categories: ['port-scan'], primaryCategory: 'port-scan', requiresCredential: null, kaliToolRef: null, fields: [] },
  { name: 'shodan', displayName: 'shodan', description: '', categories: ['osint'], primaryCategory: 'osint', requiresCredential: null, kaliToolRef: null, fields: [] },
];

const mocks = [
  { request: { query: SCANNER_CATALOG_QUERY }, result: { data: { scannerCatalog: catalog } } },
  { request: { query: SCAN_TEMPLATES_QUERY }, result: { data: { scanTemplates: [] } } },
];

describe('CockpitCommandBar (Recon)', () => {
  it('ne propose pas les scanners OSINT', async () => {
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <CockpitCommandBar engagementId="eng-1" pills={[]} />
      </MockedProvider>,
    );
    // showAll off + cible vide (detected=null → acceptsTarget passe tout) : nmap visible, shodan exclu
    expect(await screen.findByRole('option', { name: 'nmap' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'shodan' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Lancer les tests**

Run: `pnpm nx test frontend --testFile=cockpit-command-bar-osint.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/cockpit/cockpit-command-bar.tsx apps/frontend/src/features/cockpit/__tests__/cockpit-command-bar-osint.spec.tsx
git commit -m "feat(frontend): Recon launcher excludes OSINT scanners"
```

---

## Task 5 : enum `ScanGroup` + champ `group` sur le filtre

**Files:**
- Create: `apps/api-gateway/src/app/scans/dto/scan-group.enum.ts`
- Modify: `apps/api-gateway/src/app/scans/dto/scans-filter.input.ts`

- [ ] **Step 1: Créer l'enum GraphQL**

`apps/api-gateway/src/app/scans/dto/scan-group.enum.ts` :

```ts
import { registerEnumType } from '@nestjs/graphql';

/** Groupe de scanners : OSINT (passif/identité/breach) vs RECON (tout le reste). */
export enum ScanGroup {
  OSINT = 'OSINT',
  RECON = 'RECON',
}

registerEnumType(ScanGroup, { name: 'ScanGroup' });
```

- [ ] **Step 2: Ajouter le champ `group` (décoré class-validator)**

Dans `apps/api-gateway/src/app/scans/dto/scans-filter.input.ts`, ajouter l'import :

```ts
import { ScanGroup } from './scan-group.enum';
```

Et le champ (après `scannerName`, en respectant la règle CLAUDE.md : tout champ porte un décorateur class-validator) :

```ts
  @Field(() => ScanGroup, { nullable: true })
  @IsOptional()
  @IsEnum(ScanGroup)
  group?: ScanGroup;
```

- [ ] **Step 3: Type-check**

Run: `pnpm nx type-check api-gateway`
Expected: PASS (SDL régénérée au boot).

- [ ] **Step 4: Commit**

```bash
git add apps/api-gateway/src/app/scans/dto/scan-group.enum.ts apps/api-gateway/src/app/scans/dto/scans-filter.input.ts
git commit -m "feat(api): add ScanGroup filter enum to scans filter"
```

---

## Task 6 : filtre serveur `group` dans `listAllForOwner`

**Files:**
- Modify: `apps/api-gateway/src/app/scans/scans.service.ts`
- Test: `apps/api-gateway/src/app/scans/__tests__/scans-group-filter.service.spec.ts`

Contexte : `ScannerRegistry.osintScannerNames()` donne la liste OSINT. On filtre les scans qui ont au moins un job du groupe voulu, puis on **retire des jobs renvoyés** ceux hors-groupe (un scan mixte n'affiche que ses jobs du bon groupe).

- [ ] **Step 1: Écrire le test qui échoue**

`apps/api-gateway/src/app/scans/__tests__/scans-group-filter.service.spec.ts` :

```ts
import { ScansService } from '../scans.service';
import { ScanGroup } from '../dto/scan-group.enum';

describe('ScansService.listAllForOwner — filtre group', () => {
  function makeService(scans: unknown[]) {
    const prisma = { scan: { findMany: jest.fn().mockResolvedValue(scans) } };
    const registry = { osintScannerNames: jest.fn().mockReturnValue(['shodan', 'holehe']) };
    const svc = Object.create(ScansService.prototype) as ScansService;
    (svc as unknown as { prisma: unknown }).prisma = prisma;
    (svc as unknown as { registry: unknown }).registry = registry;
    return { svc, prisma };
  }

  it('OSINT : ne garde que les jobs OSINT des scans', async () => {
    const scans = [
      { id: 's1', status: 'RUNNING', jobs: [
        { id: 'j1', scannerName: 'shodan' },
        { id: 'j2', scannerName: 'nmap' },
      ] },
    ];
    const { svc, prisma } = makeService(scans);
    const res = await svc.listAllForOwner('u1', { group: ScanGroup.OSINT });
    // where.jobs.some.scannerName.in = noms OSINT
    const where = (prisma.scan.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.jobs.some.scannerName.in).toEqual(['shodan', 'holehe']);
    // jobs post-filtrés : nmap retiré
    expect(res[0].jobs.map((j: { id: string }) => j.id)).toEqual(['j1']);
  });

  it('RECON : exclut les jobs OSINT (notIn)', async () => {
    const scans = [
      { id: 's1', status: 'RUNNING', jobs: [
        { id: 'j1', scannerName: 'shodan' },
        { id: 'j2', scannerName: 'nmap' },
      ] },
    ];
    const { svc, prisma } = makeService(scans);
    const res = await svc.listAllForOwner('u1', { group: ScanGroup.RECON });
    const where = (prisma.scan.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.jobs.some.scannerName.notIn).toEqual(['shodan', 'holehe']);
    expect(res[0].jobs.map((j: { id: string }) => j.id)).toEqual(['j2']);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `pnpm nx test api-gateway --testFile=scans-group-filter.service.spec.ts`
Expected: FAIL — le filtre `group` n'existe pas ; les jobs ne sont pas post-filtrés.

- [ ] **Step 3: Injecter le registry dans `ScansService`**

Dans `apps/api-gateway/src/app/scans/scans.service.ts` : vérifier le constructeur. S'il n'injecte pas déjà `ScannerRegistry`, l'ajouter :

```ts
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
// … dans le constructeur :
    @Inject(ScannerRegistry) private readonly registry: ScannerRegistry,
```

(`ScannerRegistry` est fourni globalement par `AllScannersModule` déjà importé côté api-gateway ; aucun provider à ajouter.)

- [ ] **Step 4: Implémenter le filtre + post-filtrage des jobs**

Remplacer le corps de `listAllForOwner` (lignes 185-200) par :

```ts
async listAllForOwner(userId: string, filter?: ScansFilterInput) {
  const where: Prisma.ScanWhereInput = {
    engagement: { ownerId: userId, deletedAt: null },
  };
  if (filter?.statusIn?.length) where.status = { in: filter.statusIn };
  else if (filter?.status) where.status = filter.status;
  if (filter?.engagementId) where.engagementId = filter.engagementId;
  if (filter?.scannerName) where.jobs = { some: { scannerName: filter.scannerName } };

  const osintNames = filter?.group ? this.registry.osintScannerNames() : null;
  if (filter?.group === 'OSINT') {
    where.jobs = { some: { scannerName: { in: osintNames! } } };
  } else if (filter?.group === 'RECON') {
    where.jobs = { some: { scannerName: { notIn: osintNames! } } };
  }

  const scans = await this.prisma.scan.findMany({
    where,
    include: { jobs: true },
    orderBy: { createdAt: 'desc' },
    take: filter?.limit ?? 50,
    skip: filter?.offset ?? 0,
  });

  // Post-filtrer les jobs affichés pour qu'un scan mixte ne montre que ses jobs du groupe.
  if (filter?.group && osintNames) {
    const osintSet = new Set(osintNames);
    const wantOsint = filter.group === 'OSINT';
    for (const scan of scans) {
      scan.jobs = scan.jobs.filter((j) => osintSet.has(j.scannerName) === wantOsint);
    }
  }
  return scans;
}
```

- [ ] **Step 5: Lancer le test pour vérifier le succès**

Run: `pnpm nx test api-gateway --testFile=scans-group-filter.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/app/scans/scans.service.ts apps/api-gateway/src/app/scans/__tests__/scans-group-filter.service.spec.ts
git commit -m "feat(api): filter allScans by OSINT/RECON group via registry"
```

---

## Task 7 : threader `group` du hook jusqu'aux pages

**Files:**
- Modify: `apps/frontend/src/features/cockpit/use-active-scanners.ts`
- Modify: `apps/frontend/src/features/cockpit/active-scanners-list.tsx`
- Modify: `apps/frontend/src/features/cockpit/cockpit-page.tsx`
- Modify: `apps/frontend/src/features/osint/osint-cockpit-page.tsx`
- Modify: `apps/frontend/src/lib/graphql/queries.ts`

- [ ] **Step 1: `ALL_SCANS_QUERY` accepte `group`**

Dans `apps/frontend/src/lib/graphql/queries.ts`, `ALL_SCANS_QUERY` prend déjà `$filter: ScansFilterInput`. Aucun changement de signature nécessaire — `group` passe dans l'objet `filter`. Vérifier que la query envoie bien tout l'objet `filter` (c'est le cas). Aucune édition si le filtre est déjà passé en bloc.

- [ ] **Step 2: Param `group` dans `useActiveScanners`**

Dans `apps/frontend/src/features/cockpit/use-active-scanners.ts`, modifier la signature et le filtre :

```ts
export function useActiveScanners(
  engagementId?: string,
  statuses: string[] = ['RUNNING', 'QUEUED'],
  group?: 'OSINT' | 'RECON',
) {
  const filter: {
    engagementId?: string;
    statusIn?: string[];
    group?: 'OSINT' | 'RECON';
  } = {};
  if (engagementId) filter.engagementId = engagementId;
  if (statuses.length) filter.statusIn = statuses;
  if (group) filter.group = group;
  // … reste inchangé
```

- [ ] **Step 3: Prop `group` dans `ActiveScannersList`**

Dans `apps/frontend/src/features/cockpit/active-scanners-list.tsx` : ajouter `group?: 'OSINT' | 'RECON'` à `ActiveScannersListProps`, le déstructurer, et le passer : `useActiveScanners(engagementId, statuses, group)`.

- [ ] **Step 4: Recon → `group="RECON"`**

Dans `apps/frontend/src/features/cockpit/cockpit-page.tsx` :
- ligne 21 : `const { active } = useActiveScanners(scope, undefined, 'RECON');` (garder le défaut de statuses : passer `undefined` conserve `['RUNNING','QUEUED']`).
- ligne 50 : sur `<ActiveScannersList … />`, ajouter la prop `group="RECON"`.

- [ ] **Step 5: OSINT → `group="OSINT"`**

Dans `apps/frontend/src/features/osint/osint-cockpit-page.tsx` :
- ligne 30 : `const { active } = useActiveScanners(scope, undefined, 'OSINT');`
- ligne 79 : sur `<ActiveScannersList … />`, ajouter la prop `group="OSINT"`.

- [ ] **Step 6: Type-check + lint**

Run: `pnpm nx type-check frontend && pnpm nx lint frontend`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/cockpit/use-active-scanners.ts apps/frontend/src/features/cockpit/active-scanners-list.tsx apps/frontend/src/features/cockpit/cockpit-page.tsx apps/frontend/src/features/osint/osint-cockpit-page.tsx
git commit -m "feat(frontend): scope active-scanners list to OSINT vs RECON per page"
```

---

## Task 8 : garde — les seed-presets OSINT sont bien OSINT par catégorie

**Files:**
- Create: `apps/api-gateway/src/app/osint/__tests__/osint-presets-are-osint.spec.ts`

Objectif : empêcher la dérive future — tout scanner listé dans `OSINT_PRESETS` doit avoir une catégorie primaire OSINT dans le registre.

- [ ] **Step 1: Écrire le test**

`apps/api-gateway/src/app/osint/__tests__/osint-presets-are-osint.spec.ts` :

```ts
import { AllScannersModule } from '@autoscanner/scanners-all';
import { Test } from '@nestjs/testing';
import { ScannerRegistry, isOsintScanner } from '@autoscanner/scanner-sdk';
import { OSINT_PRESETS } from '../osint-presets';

describe('OSINT_PRESETS ⊂ scanners OSINT', () => {
  it('chaque scanner de preset est OSINT par catégorie primaire', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AllScannersModule] }).compile();
    const registry = moduleRef.get(ScannerRegistry);
    const names = new Set(Object.values(OSINT_PRESETS).flat().map((s) => s.scanner));
    const offenders: string[] = [];
    for (const name of names) {
      if (!registry.has(name)) { offenders.push(`${name} (absent du registre)`); continue; }
      if (!isOsintScanner(registry.get(name))) offenders.push(`${name} (primaire non-OSINT)`);
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer le test**

Run: `pnpm nx test api-gateway --testFile=osint-presets-are-osint.spec.ts`
Expected: PASS. **Si des offenders apparaissent**, corriger le scanner fautif dans `libs/scanners/<name>/` en posant `primaryCategory: ScannerCategory.OSINT` (ou en réordonnant `category[]`) — c'est exactement le mécanisme de contrôle « catégorie primaire » prévu par la spec. Commiter ces corrections avec le test.

- [ ] **Step 3: Commit**

```bash
git add apps/api-gateway/src/app/osint/__tests__/osint-presets-are-osint.spec.ts
# + éventuels libs/scanners/<name>/src/*.scanner.ts corrigés
git commit -m "test(osint): guard OSINT presets are OSINT-categorized"
```

---

## Task 9 : Vérification end-to-end (manuelle)

**Files:** aucun (validation)

- [ ] **Step 1: Démarrer l'app**

Run: `pnpm dev:up && pnpm nx serve api-gateway && pnpm nx serve frontend` (+ `pnpm dev:workers`).

- [ ] **Step 2: Page Recon (cockpit racine)**

Ouvrir `/` (Recon). Le sélecteur de scanner **ne contient plus** shodan/censys/holehe/maigret/etc. ; cocher « tous » ne les réintroduit pas.

- [ ] **Step 3: Lancer un scan OSINT et un scan Recon**

Depuis `/osint`, lancer une investigation (ex. domaine). Depuis `/`, lancer un nmap. Vérifier :
- `/osint` → la liste des scanners actifs ne montre que les jobs OSINT.
- `/` (Recon) → la liste ne montre que les jobs recon (nmap), pas les jobs OSINT.

- [ ] **Step 4: Suite de tests**

Run: `pnpm nx test scanner-sdk && pnpm nx test api-gateway && pnpm nx test frontend`
Expected: vert (au moins les fichiers créés/modifiés ici).

---

## Self-review (fait à l'écriture)

- **Couverture spec (Fondation + §1)** : `primaryCategory` + `isOsintScanner` ✔ (T1), exposé catalogue ✔ (T2), miroir frontend ✔ (T3), launcher Recon exclut OSINT ✔ (T4), filtre serveur `group` ✔ (T5-T6), listes de jobs séparées par page ✔ (T7), presets OSINT réconciliés ✔ (T8). Règle « catégorie primaire » ✔ (T1).
- **Placeholders** : aucun ; chaque step porte son code. La seule branche conditionnelle (offenders en T8) décrit l'action concrète attendue.
- **Cohérence des noms** : `primaryCategoryOf`, `isOsintScanner`, `osintScannerNames`, `ScanGroup`, `isOsintEntry`, `OSINT_RAW_CATEGORIES` — identiques d'une tâche à l'autre ; côté frontend le groupe est le littéral `'OSINT' | 'RECON'`.
- **Hors périmètre assumé** : `FindingsFluxFeed` (findings transverses), launcher OSINT (déjà seed-presets, verrouillé par T8). Pas de migration Prisma.
