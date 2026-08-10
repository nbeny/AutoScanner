# Kali Tools in Cockpits — Implementation Plan (#3b)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface a curated subset of the 852-tool Kali dataset inside the Recon and OSINT cockpits, launched via `runKaliTool`, reusing the #1 `ManOptionPalette`.

**Architecture:** A pure frontend curation module maps categories→cockpit, drops infra packages, and collapses to one primary binary per package. A shared `KaliToolLauncher` component (picker + palette + args + preview + launch) is embedded as a `'kali'` mode in the Recon command bar and a launcher on the OSINT page.

**Reference spec:** `docs/superpowers/specs/2026-08-11-kali-cockpit-merge-design.md`
**Branch:** `feat/kali-cockpit-merge` (spec committed).

---

## Task 1: Curation module

**Files:**
- Create: `apps/frontend/src/features/cockpit/kali-cockpit-catalog.ts`
- Test: `apps/frontend/src/features/cockpit/__tests__/kali-cockpit-catalog.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { curateKaliTools, type KaliToolRow } from '../kali-cockpit-catalog';

const rows: KaliToolRow[] = [
  { binary: 'dnsrecon', package: 'dnsrecon', displayName: 'dnsrecon', description: 'DNS recon', categories: ['information-gathering'], hasHelp: true, optionCount: 29 },
  { binary: 'apache2ctl', package: 'apache2', displayName: 'apache2ctl', description: 'apache', categories: ['web'], hasHelp: true, optionCount: 1 },
  { binary: 'a2enmod', package: 'apache2', displayName: 'a2enmod', description: 'apache', categories: ['web'], hasHelp: false, optionCount: 0 },
  { binary: 'nikto', package: 'nikto', displayName: 'nikto', description: 'web scan', categories: ['web'], hasHelp: true, optionCount: 10 },
  { binary: 'john', package: 'john', displayName: 'john', description: 'cracker', categories: ['passwords'], hasHelp: true, optionCount: 5 },
  { binary: 'theharvester', package: 'theharvester', displayName: 'theHarvester', description: 'osint', categories: ['information-gathering'], hasHelp: true, optionCount: 8 },
];

describe('curateKaliTools', () => {
  it('keeps RECON-category primaries and drops infra packages', () => {
    const out = curateKaliTools(rows, 'RECON').map((t) => t.binary);
    expect(out).toContain('dnsrecon');
    expect(out).toContain('nikto');
    expect(out).not.toContain('apache2ctl'); // infra package excluded
    expect(out).not.toContain('a2enmod');
    expect(out).not.toContain('john'); // passwords not a RECON category
  });

  it('collapses to one primary binary per package', () => {
    const dup: KaliToolRow[] = [
      { binary: 'amass', package: 'amass', displayName: 'amass', description: '', categories: ['information-gathering'], hasHelp: true, optionCount: 3 },
      { binary: 'amass-viz', package: 'amass', displayName: 'amass-viz', description: '', categories: ['information-gathering'], hasHelp: false, optionCount: 0 },
    ];
    const out = curateKaliTools(dup, 'RECON').filter((t) => t.package === 'amass');
    expect(out).toHaveLength(1);
    expect(out[0].binary).toBe('amass'); // binary === package wins
  });

  it('OSINT uses the curated allowlist, not categories', () => {
    const out = curateKaliTools(rows, 'OSINT').map((t) => t.binary);
    expect(out).toContain('theharvester');
    expect(out).not.toContain('nikto'); // web tool, not OSINT-allowlisted
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`pnpm nx test frontend --testFile=kali-cockpit-catalog.spec.ts`) → cannot find module.

- [ ] **Step 3: Implement**

```ts
export interface KaliToolRow {
  binary: string;
  package: string;
  displayName: string;
  description: string;
  categories: string[];
  hasHelp: boolean;
  optionCount: number;
}

export type CockpitGroup = 'RECON' | 'OSINT';

/** Kali category → cockpit group (null = not surfaced in any cockpit). */
export const KALI_CATEGORY_GROUP: Record<string, CockpitGroup | null> = {
  'information-gathering': 'RECON',
  web: 'RECON',
  vulnerability: 'RECON',
  database: 'RECON',
  'sniffing-spoofing': 'RECON',
  identify: 'RECON',
  detect: 'RECON',
  fuzzing: 'RECON',
  // excluded from cockpits (offensive / non-recon / already covered by scanners)
  forensics: null, 'reverse-engineering': null, passwords: null, wireless: null,
  '802-11': null, exploitation: null, 'post-exploitation': null, bluetooth: null,
  voip: null, sdr: null, rfid: null, hardware: null, gpu: null, 'crypto-stego': null,
  'social-engineering': null, reporting: null, 'windows-resources': null,
  protect: null, recover: null, respond: null, top10: null,
};

/** Infra packages the category metapackages pull as deps — never real recon tools. */
export const KALI_EXCLUDE_PACKAGES: ReadonlySet<string> = new Set([
  'apache2', 'nginx', 'default-mysql-server', 'mariadb-server', 'postgresql',
  'samba', 'snmpd', 'ldap-utils', 'redis-tools',
]);

/** Curated passive/identity binaries for the OSINT cockpit (no clean Kali category). */
export const KALI_OSINT_ALLOWLIST: ReadonlySet<string> = new Set([
  'theharvester', 'whois', 'dnsenum', 'dmitry', 'fierce', 'recon-ng', 'spiderfoot',
  'sublist3r', 'dnsrecon', 'dnswalk', 'urlcrazy', 'metagoofil',
]);

function primaryGroup(row: KaliToolRow): CockpitGroup | null {
  for (const c of row.categories) {
    const g = KALI_CATEGORY_GROUP[c];
    if (g) return g;
  }
  return null;
}

/** Curate the raw kaliTools rows into a clean, cockpit-ready list for a group. */
export function curateKaliTools(rows: KaliToolRow[], group: CockpitGroup): KaliToolRow[] {
  const inGroup = rows.filter((r) => {
    if (KALI_EXCLUDE_PACKAGES.has(r.package)) return false;
    if (group === 'OSINT') return KALI_OSINT_ALLOWLIST.has(r.binary);
    return primaryGroup(r) === 'RECON';
  });

  // One primary binary per package: prefer binary === package, else shortest name.
  const byPackage = new Map<string, KaliToolRow>();
  for (const r of inGroup) {
    const cur = byPackage.get(r.package);
    if (!cur) {
      byPackage.set(r.package, r);
      continue;
    }
    const better =
      (r.binary === r.package && cur.binary !== cur.package) ||
      (r.binary.length < cur.binary.length && cur.binary !== cur.package);
    if (better) byPackage.set(r.package, r);
  }
  // OSINT allowlist is binary-level: keep every allowlisted binary (don't collapse).
  const result = group === 'OSINT' ? inGroup : [...byPackage.values()];
  return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
```

- [ ] **Step 4: Run — expect PASS** (3 tests). **Step 5: Commit** `feat(frontend): kali cockpit curation module`.

---

## Task 2: Shared `KaliToolLauncher` component

**Files:**
- Create: `apps/frontend/src/features/cockpit/kali-tool-launcher.tsx`
- Test: `apps/frontend/src/features/cockpit/__tests__/kali-tool-launcher.spec.tsx`

Reuses `ManOptionPalette` (from #1) for arg chips and `tokenizeArgs` (from
`features/scans/tokenize-args`) for parsing. Props: `{ engagementId?: string; group:
CockpitGroup; onLaunched?: (runId: string) => void }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KALI_TOOLS_QUERY, RUN_KALI_TOOL_MUTATION } from '../../../lib/graphql/queries';
import { KaliToolLauncher } from '../kali-tool-launcher';

const toolsMock = {
  request: { query: KALI_TOOLS_QUERY },
  result: {
    data: {
      kaliTools: [
        { binary: 'dnsrecon', package: 'dnsrecon', displayName: 'dnsrecon', description: 'DNS recon', categories: ['information-gathering'], hasHelp: true, optionCount: 5 },
        { binary: 'apache2ctl', package: 'apache2', displayName: 'apache2ctl', description: 'apache', categories: ['web'], hasHelp: true, optionCount: 1 },
      ],
    },
  },
};
const runMock = {
  request: { query: RUN_KALI_TOOL_MUTATION, variables: { input: { engagementId: 'e1', binary: 'dnsrecon', args: ['-d', 'x.com'], jsonOutput: false } } },
  result: { data: { runKaliTool: { id: 'run1', binary: 'dnsrecon', args: ['-d', 'x.com'], status: 'QUEUED' } } },
};

describe('<KaliToolLauncher />', () => {
  it('shows curated tools, hides infra, and launches runKaliTool', async () => {
    const onLaunched = jest.fn();
    render(
      <MockedProvider mocks={[toolsMock, runMock]} addTypename={false}>
        <KaliToolLauncher engagementId="e1" group="RECON" onLaunched={onLaunched} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText('dnsrecon')).toBeInTheDocument());
    expect(screen.queryByText('apache2ctl')).not.toBeInTheDocument(); // infra curated out
    fireEvent.click(screen.getByText('dnsrecon'));
    fireEvent.change(screen.getByLabelText('kali-args'), { target: { value: '-d x.com' } });
    fireEvent.click(screen.getByRole('button', { name: /lancer|run/i }));
    await waitFor(() => expect(onLaunched).toHaveBeenCalledWith('run1'));
  });
});
```
> Note: if the project's frontend tests use `vi.fn()` not `jest.fn()`, swap accordingly (match neighbouring specs — they import from 'vitest').

- [ ] **Step 2: Run — expect FAIL.** **Step 3:** implement `KaliToolLauncher`:
  - `useQuery(KALI_TOOLS_QUERY)` → `curateKaliTools(rows, group)`;
  - searchable `<ul>` picker (each `<button>` shows `binary` + truncated description; `aria-label={`kali-pick-${binary}`}`);
  - on select: show `ManOptionPalette binary={selected}` (append flags to args), an `aria-label="kali-args"` input, and a `binary args` preview line;
  - `Lancer` button `disabled={!engagementId || !selected}` → `runKaliTool({ variables: { input: { engagementId, binary: selected, args: tokenizeArgs(argsText), jsonOutput: false } } })` → `onLaunched(res.data.runKaliTool.id)`.
  - Mirror the styling of `features/runner/kali-runner-page.tsx` (composer section).
- [ ] **Step 4: Run — expect PASS. Step 5: Commit** `feat(frontend): shared KaliToolLauncher (curated picker + composer + runKaliTool)`.

---

## Task 3: Recon cockpit — `'kali'` mode

**Files:** Modify `apps/frontend/src/features/cockpit/cockpit-command-bar.tsx`

- [ ] **Step 1:** Extend `type LaunchMode = 'scanner' | 'template' | 'kali';`. Add a third toggle button (label `Kali`) to the mode row (the `(['scanner','template'] as const)` map → add `'kali'`; render its label). 
- [ ] **Step 2:** When `mode === 'kali'`, render `<KaliToolLauncher engagementId={engagementId} group="RECON" onLaunched={(id) => onLaunched?.({ scanId: id, jobId: id, scannerName: 'kali', target: '' })} />` in place of the scanner/template controls (keep the target input hidden or repurposed — the Kali launcher manages its own target via args).
- [ ] **Step 3:** `pnpm nx test frontend --testFile=cockpit-command-bar.spec.tsx` + type-check. Fix any mode-related assertions. **Step 4: Commit** `feat(frontend): Kali tool mode in the Recon command bar`.

---

## Task 4: OSINT cockpit — Kali launcher

**Files:** Modify `apps/frontend/src/features/osint/osint-cockpit-page.tsx` (add a panel) — or `osint-command-bar.tsx`.

- [ ] **Step 1:** Add a collapsible "Outils Kali (OSINT)" panel rendering `<KaliToolLauncher engagementId={scope} group="OSINT" onLaunched={...} />` below the seed command bar. 
- [ ] **Step 2:** `pnpm nx test frontend` (osint specs) + type-check. **Step 3: Commit** `feat(frontend): Kali OSINT launcher in the OSINT cockpit`.

---

## Task 5: Deploy + verify

- [ ] **Step 1:** Rebuild api-gateway (serves the 852-tool dataset) + frontend:
  `docker compose -f docker/docker-compose.dev.yml --profile app up -d --build api-gateway frontend`
- [ ] **Step 2:** Smoke `kaliTools` returns 852 via the live API; hard-refresh the app; Recon → `Kali` mode shows a curated recon list (no apache2ctl); OSINT panel shows the allowlist; launching a tool creates a KaliToolRun (visible on `/runner/:id`).
- [ ] **Step 3:** `pnpm nx test frontend` full + `pnpm nx type-check frontend`. **Step 4: Commit** any test fixups.

---

## Self-Review notes
- Spec coverage: curation (T1), launcher (T2), Recon mode (T3), OSINT panel (T4), rebuild/verify (T5).
- Naming: `curateKaliTools`, `KALI_CATEGORY_GROUP`, `KALI_EXCLUDE_PACKAGES`, `KALI_OSINT_ALLOWLIST`, `KaliToolLauncher`, `CockpitGroup` consistent across module/component/tests.
- Raw-output Kali runs (no findings) — intentional, matches the Runner.
