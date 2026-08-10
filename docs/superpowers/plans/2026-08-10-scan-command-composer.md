# Scan Command Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the typed scanner-options form with a Kali-Runner-style composer — presets + clickable man-sourced options + a live server-side command preview + inline help — while keeping each scanner's typed schema and parser so findings/correlation/risk are preserved.

**Architecture:** One new backend GraphQL query, `previewScanCommand`, computes the exact `{ image, argv }` a scanner would run by calling its `build()` with a stub context (no execution, no secrets). The frontend `ScannerOptionsForm` is restructured into a composer: presets and a man-option palette lead, the live command preview mirrors the server, the typed-field grid collapses into "Options avancées", and the existing Kali doc panel provides raw help/man.

**Tech Stack:** NestJS 11 + Apollo GraphQL (backend), React + Apollo Client + Vitest + Testing Library (frontend), Zod (scanner input schemas).

**Reference spec:** `docs/superpowers/specs/2026-08-10-scan-command-composer-design.md`

**Branch:** `feat/scan-command-composer` (already created; spec + prior scope fix committed there).

---

## File Structure

Backend (`apps/api-gateway/src/app/scans/`):
- `dto/scan-command-preview.object.ts` — GraphQL `ScanCommandPreview` type (create).
- `preview-scan-command.service.ts` — pure preview service (create).
- `scans.resolver.ts` — add `previewScanCommand` query (modify).
- `scans.module.ts` — register the service provider (modify).
- `__tests__/preview-scan-command.service.spec.ts` — service tests (create).
- `__tests__/preview-scan-command.resolver.spec.ts` — resolver delegation test (create).

Frontend (`apps/frontend/src/`):
- `lib/graphql/queries.ts` — add `PREVIEW_SCAN_COMMAND_QUERY` (modify).
- `features/scans/use-scan-command-preview.ts` — debounced preview hook (create).
- `features/scans/man-option-palette.tsx` — clickable man-option chips (create).
- `features/scans/scanner-options-form.tsx` — restructure into composer (modify).
- `features/cockpit/cockpit-command-bar.tsx` — pass `target` to the form (modify).
- `features/scans/scan-run-page.tsx` — pass `target` to the form (modify).
- `lib/__tests__/use-scan-command-preview.spec.tsx` (create).
- `features/scans/__tests__/man-option-palette.spec.tsx` (create).
- `features/scans/__tests__/scanner-options-form.spec.tsx` — extend for composer (modify).

---

## Task 1: Backend — `ScanCommandPreview` type + preview service

**Files:**
- Create: `apps/api-gateway/src/app/scans/dto/scan-command-preview.object.ts`
- Create: `apps/api-gateway/src/app/scans/preview-scan-command.service.ts`
- Test: `apps/api-gateway/src/app/scans/__tests__/preview-scan-command.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api-gateway/src/app/scans/__tests__/preview-scan-command.service.spec.ts`:

```ts
import { z } from 'zod';
import { ScannerRegistry, type ScannerDefinition } from '@autoscanner/scanner-sdk';
import { ScannerCategory } from '@autoscanner/scanner-sdk';
import { PreviewScanCommandService } from '../preview-scan-command.service';

function makeDef(name: string, overrides: Partial<ScannerDefinition> = {}): ScannerDefinition {
  return {
    name,
    displayName: name,
    category: [ScannerCategory.PORT_SCAN],
    description: `${name} test scanner`,
    inputSchema: z.object({ ports: z.string().default('1-1000'), sv: z.boolean().optional() }),
    docker: {
      image: `${name}:latest`,
      network: 'bridge',
      capabilities: [],
      readonlyRootfs: true,
      memoryLimitMb: 512,
      cpuQuota: 500_000,
      defaultTimeoutMs: 60_000,
    },
    build: (input: { ports: string; sv?: boolean }, target: string) => ({
      cmd: [name, '-p', input.ports, ...(input.sv ? ['-sV'] : []), '-oX', '-', target],
    }),
    outputs: [{ format: 'XML', capture: 'stdout', parser: `${name}-xml` }],
    produces: ['Asset'],
    ...overrides,
  };
}

function svcWith(...defs: ScannerDefinition[]): PreviewScanCommandService {
  const registry = new ScannerRegistry();
  defs.forEach((d) => registry.register(d));
  return new PreviewScanCommandService(registry);
}

describe('PreviewScanCommandService', () => {
  it('builds the exact image + argv from typed options', () => {
    const svc = svcWith(makeDef('nmap'));
    const res = svc.preview('nmap', 'scanme.example.com', JSON.stringify({ ports: '1-1000', sv: true }));
    expect(res.image).toBe('nmap:latest');
    expect(res.argv).toEqual(['nmap', '-p', '1-1000', '-sV', '-oX', '-', 'scanme.example.com']);
    expect(res.note).toBeNull();
  });

  it('injects extraArgs verbatim after argv[0], like the run path', () => {
    const svc = svcWith(makeDef('nmap'));
    const res = svc.preview(
      'nmap',
      'scanme.example.com',
      JSON.stringify({ ports: '80', extraArgs: ['-Pn', '--script', 'http-title'] }),
    );
    expect(res.argv).toEqual([
      'nmap', '-Pn', '--script', 'http-title', '-p', '80', '-oX', '-', 'scanme.example.com',
    ]);
  });

  it('applies schema defaults when options are empty', () => {
    const svc = svcWith(makeDef('nmap'));
    const res = svc.preview('nmap', 't', '');
    expect(res.argv).toEqual(['nmap', '-p', '1-1000', '-oX', '-', 't']);
  });

  it('returns a note (not a throw) when the schema rejects the options', () => {
    const svc = svcWith(makeDef('nmap'));
    const res = svc.preview('nmap', 't', JSON.stringify({ ports: 123 })); // ports must be string
    expect(res.argv).toEqual([]);
    expect(res.note).toBeTruthy();
  });

  it('flags a required credential in the note', () => {
    const svc = svcWith(
      makeDef('shodan', {
        inputSchema: z.object({}),
        requiresCredential: 'SHODAN',
        build: () => ({ cmd: ['shodan', 'host'] }),
      }),
    );
    const res = svc.preview('shodan', '1.1.1.1', '');
    expect(res.argv).toEqual(['shodan', 'host']);
    expect(res.note).toContain('SHODAN');
  });

  it('throws for an unknown scanner', () => {
    const svc = svcWith(makeDef('nmap'));
    expect(() => svc.preview('ghost', 't', '')).toThrow(/not found/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-gateway --testFile=preview-scan-command.service.spec.ts`
Expected: FAIL — cannot find module `../preview-scan-command.service`.

- [ ] **Step 3: Write the GraphQL object type**

Create `apps/api-gateway/src/app/scans/dto/scan-command-preview.object.ts`:

```ts
import { Field, ObjectType } from '@nestjs/graphql';

/** Non-executing preview of the command a scanner would run (image + argv). */
@ObjectType()
export class ScanCommandPreview {
  @Field() image!: string;
  @Field(() => [String]) argv!: string[];
  /** Human note when the preview is partial (bad options, missing credential…). */
  @Field(() => String, { nullable: true }) note?: string | null;
}
```

- [ ] **Step 4: Write the service**

Create `apps/api-gateway/src/app/scans/preview-scan-command.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { injectExtraArgs, sanitizeExtraArgs, ScannerRegistry } from '@autoscanner/scanner-sdk';

import { ScanCommandPreview } from './dto/scan-command-preview.object';

/**
 * Computes the exact command a scanner would run — WITHOUT executing anything —
 * by mirroring the scan-worker build sequence: validate options through the
 * scanner's Zod inputSchema, call build() with a stub context (no real
 * credentials/OAST), then inject extraArgs the same way the run path does. Pure
 * and registry-only; credential VALUES never appear in argv (they go via env).
 */
@Injectable()
export class PreviewScanCommandService {
  constructor(@Inject(ScannerRegistry) private readonly registry: ScannerRegistry) {}

  preview(scannerName: string, target: string, optionsJson?: string): ScanCommandPreview {
    const scanner = this.registry.get(scannerName); // throws "not found" for unknown names

    let rawInput: Record<string, unknown> = {};
    if (optionsJson && optionsJson.trim()) {
      try {
        rawInput = JSON.parse(optionsJson) as Record<string, unknown>;
      } catch {
        return { image: scanner.docker.image, argv: [], note: 'optionsJson invalide (JSON).' };
      }
    }

    const extraArgs = sanitizeExtraArgs(rawInput['extraArgs']);

    try {
      const parsedInput = scanner.inputSchema.parse(rawInput);
      const build = scanner.build(parsedInput, target, {
        scanJobId: 'preview',
        engagementId: 'preview',
        scratchDir: '/output',
        oast: { serverUrl: '{{OAST}}' },
        auth: {},
      });
      const argv = injectExtraArgs(build.cmd, extraArgs);
      const note = scanner.requiresCredential
        ? `Nécessite une clé API (${scanner.requiresCredential}), injectée à l'exécution.`
        : null;
      return { image: scanner.docker.image, argv, note };
    } catch (err) {
      return { image: scanner.docker.image, argv: [], note: (err as Error).message };
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test api-gateway --testFile=preview-scan-command.service.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/app/scans/dto/scan-command-preview.object.ts \
        apps/api-gateway/src/app/scans/preview-scan-command.service.ts \
        apps/api-gateway/src/app/scans/__tests__/preview-scan-command.service.spec.ts
git commit -m "feat(api): previewScanCommand service — non-executing command preview"
```

---

## Task 2: Backend — wire the `previewScanCommand` query

**Files:**
- Modify: `apps/api-gateway/src/app/scans/scans.resolver.ts`
- Modify: `apps/api-gateway/src/app/scans/scans.module.ts`
- Test: `apps/api-gateway/src/app/scans/__tests__/preview-scan-command.resolver.spec.ts`

- [ ] **Step 1: Write the failing resolver test**

Create `apps/api-gateway/src/app/scans/__tests__/preview-scan-command.resolver.spec.ts`:

```ts
import { ScansResolver } from '../scans.resolver';
import type { ScansService } from '../scans.service';
import type { PreviewScanCommandService } from '../preview-scan-command.service';

describe('ScansResolver.previewScanCommand', () => {
  it('delegates to PreviewScanCommandService.preview', () => {
    const preview = { image: 'nmap:latest', argv: ['nmap', 't'], note: null };
    const previewSvc = { preview: jest.fn().mockReturnValue(preview) };
    const resolver = new ScansResolver(
      {} as ScansService,
      {} as never, // logSubscriber unused here
      previewSvc as unknown as PreviewScanCommandService,
    );

    const res = resolver.previewScanCommand('nmap', 'scanme.example.com', '{"ports":"80"}');

    expect(previewSvc.preview).toHaveBeenCalledWith('nmap', 'scanme.example.com', '{"ports":"80"}');
    expect(res).toBe(preview);
  });
});
```

> Note: this project's test runner (Vitest) exposes `jest.fn`/`jest.mock` via a compat global in existing specs; if the file errors on `jest`, replace `jest.fn()` with `vi.fn()` and add `import { vi } from 'vitest'` — match whatever the neighbouring `*.spec.ts` files use.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-gateway --testFile=preview-scan-command.resolver.spec.ts`
Expected: FAIL — `previewScanCommand` is not a function / constructor arity mismatch.

- [ ] **Step 3: Add the resolver dependency + query**

In `apps/api-gateway/src/app/scans/scans.resolver.ts`:

Add imports near the other dto/service imports:

```ts
import { ScanCommandPreview } from './dto/scan-command-preview.object';
import { PreviewScanCommandService } from './preview-scan-command.service';
```

Add the constructor parameter (after the existing `logSubscriber` param):

```ts
  constructor(
    private readonly svc: ScansService,
    @Inject(LOG_STREAM_SUBSCRIBER) private readonly logSubscriber: LogStreamSubscriber,
    private readonly previewSvc: PreviewScanCommandService,
  ) {}
```

Add the query method inside the class (e.g. next to `scannerUsageStats`):

```ts
  @Query(() => ScanCommandPreview, { name: 'previewScanCommand' })
  previewScanCommand(
    @Args('scannerName') scannerName: string,
    @Args('target') target: string,
    @Args('optionsJson', { type: () => String, nullable: true }) optionsJson?: string,
  ): ScanCommandPreview {
    return this.previewSvc.preview(scannerName, target, optionsJson);
  }
```

- [ ] **Step 4: Register the provider**

In `apps/api-gateway/src/app/scans/scans.module.ts`, add the import:

```ts
import { PreviewScanCommandService } from './preview-scan-command.service';
```

And add `PreviewScanCommandService` to the `providers` array (after `ScansService`):

```ts
  providers: [
    ScansService,
    PreviewScanCommandService,
    ScansResolver,
    // …unchanged…
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test api-gateway --testFile=preview-scan-command.resolver.spec.ts`
Expected: PASS.

- [ ] **Step 6: Type-check + live smoke**

Run: `pnpm nx type-check api-gateway`
Expected: PASS.

If the dev API is running (`http://localhost:4000`), smoke the query end to end:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@autoscanner.local","password":"changeme"}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
curl -s -X POST http://localhost:4000/graphql -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"query($s:String!,$t:String!,$o:String){previewScanCommand(scannerName:$s,target:$t,optionsJson:$o){image argv note}}","variables":{"s":"nmap","t":"scanme.example.com","o":"{\"ports\":\"1-1000\"}"}}'
```
Expected: JSON with `image`, an `argv` array, and `note`.

- [ ] **Step 7: Commit**

```bash
git add apps/api-gateway/src/app/scans/scans.resolver.ts \
        apps/api-gateway/src/app/scans/scans.module.ts \
        apps/api-gateway/src/app/scans/__tests__/preview-scan-command.resolver.spec.ts
git commit -m "feat(api): expose previewScanCommand query"
```

---

## Task 3: Frontend — add the preview query

**Files:**
- Modify: `apps/frontend/src/lib/graphql/queries.ts`

- [ ] **Step 1: Add the query**

Append to `apps/frontend/src/lib/graphql/queries.ts`:

```ts
export const PREVIEW_SCAN_COMMAND_QUERY = gql`
  query PreviewScanCommand($scannerName: String!, $target: String!, $optionsJson: String) {
    previewScanCommand(scannerName: $scannerName, target: $target, optionsJson: $optionsJson) {
      image
      argv
      note
    }
  }
`;
```

- [ ] **Step 2: Type-check**

Run: `pnpm nx type-check frontend`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/graphql/queries.ts
git commit -m "feat(frontend): PREVIEW_SCAN_COMMAND_QUERY"
```

---

## Task 4: Frontend — `useScanCommandPreview` hook

**Files:**
- Create: `apps/frontend/src/features/scans/use-scan-command-preview.ts`
- Test: `apps/frontend/src/lib/__tests__/use-scan-command-preview.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/lib/__tests__/use-scan-command-preview.spec.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { PREVIEW_SCAN_COMMAND_QUERY } from '../graphql/queries';
import { useScanCommandPreview } from '../../features/scans/use-scan-command-preview';

function mock(scannerName: string, target: string, optionsJson: string, argv: string[]) {
  return {
    request: { query: PREVIEW_SCAN_COMMAND_QUERY, variables: { scannerName, target, optionsJson } },
    result: { data: { previewScanCommand: { image: 'nmap:latest', argv, note: null } } },
  };
}

function Probe({ target }: { target: string }) {
  const { image, argv, loading } = useScanCommandPreview('nmap', target, '{"ports":"80"}', 0);
  return <div data-testid="p">{loading ? 'loading' : `${image} ${argv.join(' ')}`}</div>;
}

describe('useScanCommandPreview', () => {
  it('returns the previewed image + argv', async () => {
    render(
      <MockedProvider
        mocks={[mock('nmap', 'scanme.example.com', '{"ports":"80"}', ['nmap', '-p', '80'])]}
        addTypename={false}
      >
        <Probe target="scanme.example.com" />
      </MockedProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('p').textContent).toBe('nmap:latest nmap -p 80'),
    );
  });

  it('skips the query when target is empty', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <Probe target="" />
      </MockedProvider>,
    );
    // No mock is needed because the query is skipped; nothing throws.
    expect(screen.getByTestId('p').textContent).toBe(' ');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test frontend --testFile=use-scan-command-preview.spec.tsx`
Expected: FAIL — cannot find module `use-scan-command-preview`.

- [ ] **Step 3: Write the hook**

Create `apps/frontend/src/features/scans/use-scan-command-preview.ts`:

```ts
import { useEffect, useState } from 'react';
import { useQuery } from '@apollo/client';
import { PREVIEW_SCAN_COMMAND_QUERY } from '../../lib/graphql/queries';

interface PreviewData {
  previewScanCommand: { image: string; argv: string[]; note: string | null };
}

/**
 * Debounced live preview of the exact command a scanner will run, from the
 * server (`previewScanCommand`). Skips while scanner/target is empty. `debounceMs`
 * is injectable so tests can disable the delay.
 */
export function useScanCommandPreview(
  scannerName: string,
  target: string,
  optionsJson: string,
  debounceMs = 300,
): { image: string; argv: string[]; note: string | null; loading: boolean } {
  const [debounced, setDebounced] = useState({ target, optionsJson });
  useEffect(() => {
    const id = setTimeout(() => setDebounced({ target, optionsJson }), debounceMs);
    return () => clearTimeout(id);
  }, [target, optionsJson, debounceMs]);

  const skip = !scannerName || !debounced.target;
  const { data, loading } = useQuery<PreviewData>(PREVIEW_SCAN_COMMAND_QUERY, {
    skip,
    variables: { scannerName, target: debounced.target, optionsJson: debounced.optionsJson },
    fetchPolicy: 'cache-and-network',
  });

  const p = data?.previewScanCommand;
  return { image: p?.image ?? '', argv: p?.argv ?? [], note: p?.note ?? null, loading };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test frontend --testFile=use-scan-command-preview.spec.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/scans/use-scan-command-preview.ts \
        apps/frontend/src/lib/__tests__/use-scan-command-preview.spec.tsx
git commit -m "feat(frontend): useScanCommandPreview debounced hook"
```

---

## Task 5: Frontend — `ManOptionPalette` component

**Files:**
- Create: `apps/frontend/src/features/scans/man-option-palette.tsx`
- Test: `apps/frontend/src/features/scans/__tests__/man-option-palette.spec.tsx`

The palette reuses the existing `KALI_TOOL_QUERY` (already in `queries.ts`, used by `KaliToolDocPanel`) to fetch a binary's man-sourced options and renders them as clickable chips.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/scans/__tests__/man-option-palette.spec.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KALI_TOOL_QUERY } from '../../../lib/graphql/queries';
import { ManOptionPalette } from '../man-option-palette';

const kaliMock = {
  request: { query: KALI_TOOL_QUERY, variables: { binary: 'nmap' } },
  result: {
    data: {
      kaliTool: {
        binary: 'nmap',
        displayName: 'nmap',
        description: 'Network mapper',
        homepage: null,
        helpTextRaw: null,
        optionsSource: 'man',
        manTextRaw: null,
        options: [
          { flag: '-sV', argHint: null, description: 'Probe open ports for service/version' },
          { flag: '-p', argHint: '<ports>', description: 'Only scan specified ports' },
        ],
      },
    },
  },
};

describe('<ManOptionPalette />', () => {
  it('renders clickable option chips and calls onAddFlag on click', async () => {
    const onAddFlag = vi.fn();
    render(
      <MockedProvider mocks={[kaliMock]} addTypename={false}>
        <ManOptionPalette binary="nmap" onAddFlag={onAddFlag} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('man-option--sV')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('man-option--sV'));
    expect(onAddFlag).toHaveBeenCalledWith('-sV');
  });

  it('renders nothing when binary is null', () => {
    const { container } = render(
      <MockedProvider mocks={[]} addTypename={false}>
        <ManOptionPalette binary={null} onAddFlag={() => undefined} />
      </MockedProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test frontend --testFile=man-option-palette.spec.tsx`
Expected: FAIL — cannot find module `man-option-palette`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/src/features/scans/man-option-palette.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { KALI_TOOL_QUERY } from '../../lib/graphql/queries';

interface KaliToolOption {
  flag: string;
  argHint: string | null;
  description: string;
}
interface KaliToolDetail {
  binary: string;
  optionsSource?: string;
  options: KaliToolOption[];
}

/**
 * Clickable palette of a Kali binary's man/help-sourced options. Clicking a chip
 * appends its flag to the raw args (via onAddFlag). Renders nothing when the
 * scanner has no Kali binary or the binary is absent from the dataset.
 */
export function ManOptionPalette({
  binary,
  onAddFlag,
}: {
  binary: string | null;
  onAddFlag: (flag: string) => void;
}) {
  const [search, setSearch] = useState('');
  const { data } = useQuery<{ kaliTool: KaliToolDetail | null }>(KALI_TOOL_QUERY, {
    skip: !binary,
    variables: binary ? { binary } : undefined,
  });

  const options = data?.kaliTool?.options ?? [];
  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (q
        ? options.filter(
            (o) => o.flag.toLowerCase().includes(q) || o.description.toLowerCase().includes(q),
          )
        : options
      ).slice(0, 40),
    [options, q],
  );

  if (!binary || options.length === 0) return null;

  return (
    <div className="space-y-2" aria-label="man-option-palette">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">
          Options (man) — clique pour ajouter
        </span>
        {options.length > 12 ? (
          <input
            aria-label="man-option-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filtrer…"
            className="w-28 rounded border border-space-800 bg-space-900 px-2 py-0.5 text-xs text-slate-100 font-mono"
          />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {filtered.map((o) => (
          <button
            key={o.flag}
            type="button"
            aria-label={`man-option-${o.flag}`}
            title={o.description}
            onClick={() => onAddFlag(o.flag)}
            className="rounded border border-space-800 bg-space-900 px-2 py-0.5 text-xs font-mono text-slate-300 hover:border-neon-cyan/50"
          >
            {o.flag}
            {o.argHint ? <span className="text-slate-500"> {o.argHint}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test frontend --testFile=man-option-palette.spec.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/scans/man-option-palette.tsx \
        apps/frontend/src/features/scans/__tests__/man-option-palette.spec.tsx
git commit -m "feat(frontend): ManOptionPalette — clickable man-sourced option chips"
```

---

## Task 6: Frontend — thread `target` into `ScannerOptionsForm`

This is a mechanical prop addition with no behaviour change, so the existing form tests stay green.

**Files:**
- Modify: `apps/frontend/src/features/scans/scanner-options-form.tsx`
- Modify: `apps/frontend/src/features/cockpit/cockpit-command-bar.tsx`
- Modify: `apps/frontend/src/features/scans/scan-run-page.tsx`

- [ ] **Step 1: Add the prop to the form interface**

In `scanner-options-form.tsx`, extend `ScannerOptionsFormProps`:

```ts
interface ScannerOptionsFormProps {
  entry: ScannerCatalogEntry | undefined;
  /** Current target string — used only for the live command preview. */
  target?: string;
  /** Receives the serialized options JSON ('' when there are no options set). */
  onChange: (optionsJson: string) => void;
  /** Lets a parent (e.g. the Kali doc panel) register a handler that appends a flag to extraArgs. */
  registerAddFlag?: (fn: (flag: string) => void) => void;
}
```

And update the function signature (default `target = ''`):

```ts
export function ScannerOptionsForm({
  entry,
  target = '',
  onChange,
  registerAddFlag,
}: ScannerOptionsFormProps) {
```

- [ ] **Step 2: Pass `target` from the cockpit command bar**

In `apps/frontend/src/features/cockpit/cockpit-command-bar.tsx`, update the render (the `<ScannerOptionsForm .../>` near the bottom):

```tsx
<ScannerOptionsForm entry={selectedEntry} target={target} onChange={setOptionsJson} />
```

- [ ] **Step 3: Pass `target` from the scan-run page**

In `apps/frontend/src/features/scans/scan-run-page.tsx`, update the `<ScannerOptionsForm .../>` usage to include `target={target}` (the component already has a `target` state at line ~46):

```tsx
<ScannerOptionsForm
  entry={/* unchanged */ catalog.find((e) => e.name === scanner)}
  target={target}
  onChange={setOptionsJson}
/>
```

> If the existing JSX passes different props (e.g. `registerAddFlag`), keep them and only add `target={target}` — do not drop existing props.

- [ ] **Step 4: Run the form tests + type-check**

Run: `pnpm nx test frontend --testFile=scanner-options-form.spec.tsx --testFile=scanner-options-form-extra.spec.tsx`
Expected: PASS (unchanged behaviour).
Run: `pnpm nx type-check frontend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/scans/scanner-options-form.tsx \
        apps/frontend/src/features/cockpit/cockpit-command-bar.tsx \
        apps/frontend/src/features/scans/scan-run-page.tsx
git commit -m "feat(frontend): thread target into ScannerOptionsForm for preview"
```

---

## Task 7: Frontend — restructure `ScannerOptionsForm` into the composer

Presets and the man-option palette lead; the live command preview mirrors the server; the typed-field grid collapses into "Options avancées"; the raw args field stays. The `onChange(optionsJson)` serialization is unchanged — only layout and two added sections.

**Files:**
- Modify: `apps/frontend/src/features/scans/scanner-options-form.tsx`
- Test: `apps/frontend/src/features/scans/__tests__/scanner-options-form.spec.tsx`

- [ ] **Step 1: Write the failing composer tests**

Add these tests to `apps/frontend/src/features/scans/__tests__/scanner-options-form.spec.tsx` (keep the existing tests). Wrap renders in `MockedProvider` if they aren't already — the form now issues `KALI_TOOL_QUERY` (via the palette) and `PREVIEW_SCAN_COMMAND_QUERY`.

```tsx
import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KALI_TOOL_QUERY, PREVIEW_SCAN_COMMAND_QUERY } from '../../../lib/graphql/queries';
import { ScannerOptionsForm } from '../scanner-options-form';
import type { ScannerCatalogEntry } from '../scanner-catalog';

const nmapEntry: ScannerCatalogEntry = {
  name: 'nmap',
  displayName: 'nmap',
  description: 'Network mapper',
  categories: ['port-scan'],
  primaryCategory: 'port-scan',
  requiresCredential: null,
  kaliToolRef: 'nmap',
  fields: [
    { name: 'ports', type: 'string', required: false, default: '1-1000', min: null, max: null, enumValues: null, description: 'Ports' },
  ],
  presets: [],
};

const kaliMock = {
  request: { query: KALI_TOOL_QUERY, variables: { binary: 'nmap' } },
  result: {
    data: {
      kaliTool: {
        binary: 'nmap', displayName: 'nmap', description: 'Network mapper', homepage: null,
        helpTextRaw: null, optionsSource: 'man', manTextRaw: null,
        options: [{ flag: '-sV', argHint: null, description: 'service/version' }],
      },
    },
  },
};

// The preview mock must match whatever optionsJson the form emits; use a permissive
// matcher by supplying a variableMatcher-friendly mock for the empty-options case.
const previewMock = {
  request: {
    query: PREVIEW_SCAN_COMMAND_QUERY,
    variables: { scannerName: 'nmap', target: 'scanme.example.com', optionsJson: '' },
  },
  result: { data: { previewScanCommand: { image: 'nmap:latest', argv: ['nmap', '-p', '1-1000'], note: null } } },
};

function renderForm() {
  return render(
    <MockedProvider mocks={[kaliMock, previewMock]} addTypename={false}>
      <ScannerOptionsForm entry={nmapEntry} target="scanme.example.com" onChange={() => undefined} />
    </MockedProvider>,
  );
}

describe('<ScannerOptionsForm /> composer', () => {
  it('collapses the typed field grid under "Options avancées" (closed by default)', () => {
    renderForm();
    const advanced = screen.getByLabelText('advanced-options');
    expect(advanced).toBeInTheDocument();
    expect((advanced as HTMLDetailsElement).open).toBe(false);
  });

  it('shows the man-option palette and appends a clicked flag to raw args', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText('man-option--sV')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('man-option--sV'));
    expect((screen.getByLabelText('extra-args') as HTMLInputElement).value).toContain('-sV');
  });

  it('renders the live command preview from the server', async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText('command-preview').textContent).toContain('nmap -p 1-1000'),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test frontend --testFile=scanner-options-form.spec.tsx`
Expected: FAIL — no `advanced-options` / `command-preview` / palette elements yet.

- [ ] **Step 3: Restructure the component's JSX**

In `apps/frontend/src/features/scans/scanner-options-form.tsx`:

Add imports at the top:

```ts
import { ManOptionPalette } from './man-option-palette';
import { useScanCommandPreview } from './use-scan-command-preview';
import { KaliToolDocPanel } from './kali-tool-doc-panel';
```

Inside the component body, after the `usage` computation and before `if (!entry) return null;`, add the preview hook and an append helper. `optionsJson` is what the last `onChange` emitted — track it in state so the preview and palette share it:

```ts
  const [optionsJson, setOptionsJson] = useState('');
  // Emit AND remember the serialized options so the preview can mirror them.
  // (Replace the existing `onChange(...)` call in the serialization effect with
  //  setOptionsJson + onChange — see Step 4.)

  const appendFlag = (flag: string) =>
    setExtraArgsText((t) => (t ? `${t} ${flag}` : flag));

  const preview = useScanCommandPreview(entry?.name ?? '', target, optionsJson);
```

- [ ] **Step 4: Route the serialized options through local state**

Replace the serialization effect's final line so the form remembers what it emits. Find:

```ts
    onChange(Object.keys(options).length ? JSON.stringify(options) : '');
```

Replace with:

```ts
    const serialized = Object.keys(options).length ? JSON.stringify(options) : '';
    setOptionsJson(serialized);
    onChange(serialized);
```

Also add `setOptionsJson` is stable (from useState) — no dep change needed; keep the effect's dependency array as `[fields, values, enabled, extraArgsText, onChange]`.

- [ ] **Step 5: Insert the new sections into the returned JSX**

The return currently renders: credential warning, presets, usage, the fields grid, and the raw-args label. Restructure to this order (keep existing preset/usage/credential blocks verbatim; wrap the fields grid in a `<details>`; add the palette, preview, and reuse the raw-args block):

```tsx
  return (
    <div className="space-y-3" aria-label="scanner-options-form">
      {/* credential warning — unchanged */}
      {entry.requiresCredential ? (
        <p className="text-xs text-amber-400">
          Nécessite une clé API : <strong>{entry.requiresCredential}</strong> (configurée dans les
          réglages).
        </p>
      ) : null}

      {/* presets — unchanged block */}
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

      {/* usage chips — unchanged block */}
      {usage.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="scanner-usage">
          <span className="text-[10px] uppercase text-slate-500">Souvent lancé</span>
          {usage.slice(0, 5).map((u) => (
            <button
              key={u.optionsJson}
              type="button"
              onClick={() => applyPreset(JSON.parse(u.optionsJson) as Record<string, unknown>)}
              className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-700"
            >
              {u.count}× {u.optionsJson}
            </button>
          ))}
        </div>
      ) : null}

      {/* NEW: man-option palette */}
      <ManOptionPalette binary={entry.kaliToolRef ?? null} onAddFlag={appendFlag} />

      {/* raw args — unchanged control, now fed by the palette */}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-200">Arguments</span>
        <input
          type="text"
          aria-label="extra-args"
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm font-mono text-slate-100"
          value={extraArgsText}
          onChange={(e) => setExtraArgsText(e.target.value)}
          placeholder="ex. -sC -p 80 (séparés par des espaces)"
        />
      </label>

      {/* NEW: live command preview */}
      <div
        aria-label="command-preview"
        className="rounded bg-space-900 px-3 py-2 text-xs font-mono text-slate-300 overflow-x-auto"
      >
        <span className="text-neon-cyan">{preview.argv[0] ?? entry.name}</span>{' '}
        {preview.argv.slice(1).join(' ')}
        {preview.note ? <div className="mt-1 text-amber-400">{preview.note}</div> : null}
      </div>

      {/* NEW: advanced typed fields, collapsed */}
      <details aria-label="advanced-options" className="rounded border border-space-800 p-2">
        <summary className="cursor-pointer text-xs text-slate-400">Options avancées</summary>
        <div className="mt-2 space-y-3">
          {fields.length === 0 ? (
            <p className="text-xs text-slate-400" aria-label="no-options">
              Cet outil n'a pas d'options configurables.
            </p>
          ) : (
            fields.map((field) => {
              const toggle = isToggle(field);
              const active = !toggle || enabled[field.name];
              const value = values[field.name];
              return (
                <div key={field.name} className="space-y-1">
                  <div className="flex items-center gap-2">
                    {toggle ? (
                      <input
                        type="checkbox"
                        aria-label={`toggle-${field.name}`}
                        checked={Boolean(enabled[field.name])}
                        onChange={(e) =>
                          setEnabled((prev) => ({ ...prev, [field.name]: e.target.checked }))
                        }
                      />
                    ) : null}
                    <span className="text-xs font-medium text-slate-200">
                      {field.name}
                      {field.required ? <span className="text-red-400"> *</span> : null}
                    </span>
                    <span className="text-[10px] text-slate-500">{field.type}</span>
                  </div>
                  {field.description ? (
                    <p className="text-[11px] text-slate-500">{field.description}</p>
                  ) : null}
                  {active ? renderControl(field, value, (v) => setValue(field.name, v)) : null}
                </div>
              );
            })
          )}
        </div>
      </details>

      {/* NEW: inline help / man (moved in from scan-run-page so BOTH callers get it) */}
      {entry.kaliToolRef ? (
        <KaliToolDocPanel binary={entry.kaliToolRef} onAddFlag={appendFlag} />
      ) : null}
    </div>
  );
```

> Removed: the old top-level "Arguments bruts" label and the old always-visible fields grid (both are now represented above). `renderControl`, `isToggle`, `applyPreset`, `setValue`, `enabled`, `values`, `extraArgsText`, `usage` all remain used. The `registerAddFlag` prop/effect can stay (harmless, now unused by callers); it is cleaned up next.

- [ ] **Step 5b: Remove the now-duplicate doc panel from `scan-run-page.tsx`**

The composer renders the Kali doc panel internally, so `scan-run-page` must stop
rendering its own (otherwise it shows twice). In
`apps/frontend/src/features/scans/scan-run-page.tsx`:

- Delete the external `<KaliToolDocPanel .../>` block (currently lines ~189–194):

```tsx
          {selectedEntry?.kaliToolRef ? (
            <KaliToolDocPanel
              binary={selectedEntry.kaliToolRef}
              onAddFlag={(f) => addFlagRef.current?.(f)}
            />
          ) : null}
```

- Drop the `registerAddFlag={(fn) => { addFlagRef.current = fn; }}` prop from the
  `<ScannerOptionsForm .../>` usage (keep `entry`, `target`, `onChange`).
- Remove the now-unused `KaliToolDocPanel` import and the `addFlagRef` declaration
  (search for `addFlagRef` — delete its `useRef` line). If TypeScript flags any
  other now-unused symbol, remove it too.

Verify: `pnpm nx type-check frontend` → PASS (no unused-var errors).

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm nx test frontend --testFile=scanner-options-form.spec.tsx --testFile=scanner-options-form-extra.spec.tsx`
Expected: PASS (existing + 3 new tests).

If `scanner-options-form-extra.spec.tsx` renders the form WITHOUT a `MockedProvider`, wrap its render in one (the form now issues GraphQL queries). Add empty mocks: `<MockedProvider mocks={[]} addTypename={false}>…</MockedProvider>`.

- [ ] **Step 7: Type-check + full frontend test**

Run: `pnpm nx type-check frontend`
Expected: PASS.
Run: `pnpm nx test frontend`
Expected: PASS (whole project).

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/scans/scanner-options-form.tsx \
        apps/frontend/src/features/scans/scan-run-page.tsx \
        apps/frontend/src/features/scans/__tests__/scanner-options-form.spec.tsx \
        apps/frontend/src/features/scans/__tests__/scanner-options-form-extra.spec.tsx
git commit -m "feat(frontend): scanner options composer — palette + live preview + advanced grid + inline help"
```

---

## Task 8: Verify end-to-end in the running app

- [ ] **Step 1: Rebuild the frontend container**

Run:
```bash
docker compose -f docker/docker-compose.dev.yml --profile app up -d --build frontend
```
Expected: frontend container recreated (exit 0).

- [ ] **Step 2: Manual smoke**

Hard-refresh `http://localhost:4200` (Ctrl+Shift+R). On the Recon cockpit, open a scanner's **Options**:
- presets + man-option palette appear;
- clicking a man chip appends its flag to the Arguments field and the **command preview** updates;
- "Options avancées" is collapsed by default and expands to the typed fields;
- launching still works (findings still produced — unchanged run path).

- [ ] **Step 3: Final full check**

Run: `pnpm test` (run-many) or at least `pnpm nx test frontend` + `pnpm nx test api-gateway`.
Expected: PASS.

---

## Self-Review notes (addressed)

- **Spec coverage:** preview query (Task 1–3), man palette (Task 5), live preview (Task 4 + 7), collapsed typed grid (Task 7), inline help via `KaliToolDocPanel` moved into the composer so BOTH callers get it (Task 7 Step 5 + 5b), `optionsJson` contract unchanged (Task 7 Step 4).
- **Preview fidelity:** the service mirrors the scan-worker sequence exactly — `inputSchema.parse` → `build()` → `injectExtraArgs(cmd, sanitizeExtraArgs(input.extraArgs))` — so the preview equals the real command.
- **Naming consistency:** `previewScanCommand` (query), `PreviewScanCommandService.preview`, `ScanCommandPreview` ({image, argv, note}), `useScanCommandPreview`, `ManOptionPalette`, aria-labels `man-option-<flag>`, `command-preview`, `advanced-options` are used identically across backend, frontend, and tests.
- **Out of scope (later):** run-via-Kali-container (#2), merge Kali tools into cockpits (#3).
