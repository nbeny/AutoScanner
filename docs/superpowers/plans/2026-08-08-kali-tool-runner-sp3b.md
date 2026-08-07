# Kali Tool Runner — SP3b (frontend command-builder + live view) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A frontend for the Kali runner — an Exegol-style command-builder (`/runner`) and a live result view (`/runner/:runId`) — consuming the fixed SP3a/SP1 GraphQL API. No backend changes.

**Architecture:** React + Apollo, Vitest + testing-library. Mirrors two existing patterns: `features/cockpit/cockpit-command-bar.tsx` (catalogue query + mutation + MockedProvider tests) for the builder, and `features/hunt/hunt-run-page.tsx` (`useQuery` + `useSubscription({onData: refetch})` + polling fallback) for the live view. Generic result rendering by `parsedJson.format`.

**Tech Stack:** React 18, @apollo/client, react-router-dom, Tailwind (existing app classes), Vitest, @testing-library/react, `@apollo/client/testing` MockedProvider.

**Repo policy note:** default branch is `main`; create a feature branch before the first commit (`git checkout -b feat/kali-tool-runner-sp3b`). Do not push without the user's consent. Pre-commit lint-staged (prettier/eslint) runs each commit.

**Spec:** `docs/superpowers/specs/2026-08-08-kali-tool-runner-sp3b-design.md`

**Prerequisite reads (patterns to mirror):**
- `apps/frontend/src/features/hunt/hunt-run-page.tsx` + `__tests__/hunt-run-page.test.tsx` (live view + subscription test).
- `apps/frontend/src/features/cockpit/cockpit-command-bar.tsx` + its spec (catalogue query + mutation + MockedProvider).
- `apps/frontend/src/lib/graphql/queries.ts` (how `gql` ops + `AI_RUN_EVENTS_SUBSCRIPTION` are declared).
- `apps/frontend/src/app-routes.tsx` and `apps/frontend/src/components/nav-rail.tsx` (routing + nav).

---

## File Structure

- `apps/frontend/src/lib/graphql/queries.ts` — add 6 ops (modify).
- `apps/frontend/src/features/runner/tokenize-args.ts` (+ test) — pure argv tokenizer.
- `apps/frontend/src/features/runner/tool-result-view.tsx` (+ test) — generic result renderer.
- `apps/frontend/src/features/runner/kali-runner-page.tsx` (+ test) — command-builder.
- `apps/frontend/src/features/runner/kali-run-page.tsx` (+ test) — live view.
- `apps/frontend/src/app-routes.tsx` — 2 routes (modify).
- `apps/frontend/src/components/nav-rail.tsx` (+ its spec) — nav entry (modify).

---

## Task 1: GraphQL client ops

**Files:**
- Modify: `apps/frontend/src/lib/graphql/queries.ts`

- [ ] **Step 1: Add the six ops** (append near the other exports; use the file's existing `gql` import + style)

```ts
export const KALI_TOOLS_QUERY = gql`
  query KaliTools {
    kaliTools {
      binary
      package
      displayName
      description
      categories
      hasHelp
      optionCount
    }
  }
`;

export const KALI_TOOL_QUERY = gql`
  query KaliTool($binary: String!) {
    kaliTool(binary: $binary) {
      binary
      displayName
      description
      homepage
      helpTextRaw
      parseConfidence
      manAvailable
      options {
        flag
        argHint
        description
      }
    }
  }
`;

export const RUN_KALI_TOOL_MUTATION = gql`
  mutation RunKaliTool($input: RunKaliToolInput!) {
    runKaliTool(input: $input) {
      id
      binary
      args
      status
    }
  }
`;

export const KALI_TOOL_RUN_QUERY = gql`
  query KaliToolRun($id: ID!) {
    kaliToolRun(id: $id) {
      id
      engagementId
      binary
      args
      target
      status
      outputFormat
      exitCode
      parsedJson
      errorMessage
      createdAt
    }
  }
`;

export const KALI_TOOL_RUNS_QUERY = gql`
  query KaliToolRuns($engagementId: ID!) {
    kaliToolRuns(engagementId: $engagementId) {
      id
      binary
      args
      status
      outputFormat
      exitCode
      createdAt
    }
  }
`;

export const KALI_TOOL_RUN_EVENTS_SUBSCRIPTION = gql`
  subscription KaliToolRunEvents($runId: ID!) {
    kaliToolRunEvents(runId: $runId) {
      type
      status
      message
    }
  }
`;
```

- [ ] **Step 2: Type-check**

Run: `pnpm nx type-check frontend`
Expected: PASS (gql strings don't need types).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/graphql/queries.ts
git commit -m "feat(runner-ui): kali runner GraphQL client ops"
```

---

## Task 2: Arg tokenizer (pure)

**Files:**
- Create: `apps/frontend/src/features/runner/tokenize-args.ts`
- Test: `apps/frontend/src/features/runner/__tests__/tokenize-args.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/frontend/src/features/runner/__tests__/tokenize-args.spec.ts
import { describe, expect, it } from 'vitest';
import { tokenizeArgs } from '../tokenize-args';

describe('tokenizeArgs', () => {
  it('splits on whitespace', () => {
    expect(tokenizeArgs('-sV -p 80 scanme.example.com')).toEqual([
      '-sV', '-p', '80', 'scanme.example.com',
    ]);
  });
  it('keeps a double-quoted span as one token, quotes stripped', () => {
    expect(tokenizeArgs('--data "a b c" -x')).toEqual(['--data', 'a b c', '-x']);
  });
  it('keeps a single-quoted span as one token', () => {
    expect(tokenizeArgs("--q 'one two'")).toEqual(['--q', 'one two']);
  });
  it('collapses extra whitespace and returns [] for blank', () => {
    expect(tokenizeArgs('   -a    -b  ')).toEqual(['-a', '-b']);
    expect(tokenizeArgs('   ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm nx test frontend --testFile=tokenize-args.spec.ts`
Expected: FAIL — `Cannot find module '../tokenize-args'`.

- [ ] **Step 3: Implement** (uses `matchAll`, not a stateful regex iterator)

```ts
// apps/frontend/src/features/runner/tokenize-args.ts
/**
 * Split a free-text args string into an argv array. Whitespace-separated, with
 * "double" or 'single' quoted spans kept as one token (quotes stripped). This is
 * a UI convenience — the server receives a plain argv array and never runs a
 * shell, so this is intentionally NOT a full shell parser.
 */
export function tokenizeArgs(input: string): string[] {
  const out: string[] = [];
  for (const m of input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return out;
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm nx test frontend --testFile=tokenize-args.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/runner/tokenize-args.ts apps/frontend/src/features/runner/__tests__/tokenize-args.spec.ts
git commit -m "feat(runner-ui): argv tokenizer"
```

---

## Task 3: `ToolResultView` (generic by format)

**Files:**
- Create: `apps/frontend/src/features/runner/tool-result-view.tsx`
- Test: `apps/frontend/src/features/runner/__tests__/tool-result-view.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/features/runner/__tests__/tool-result-view.spec.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolResultView } from '../tool-result-view';

describe('<ToolResultView />', () => {
  it('renders a json format as pretty text (not a one-line blob)', () => {
    render(<ToolResultView parsed={{ format: 'json', view: { host: 'up', ports: [22, 80] } }} />);
    const pre = screen.getByLabelText('tool-result-json');
    expect(pre.textContent).toContain('"host": "up"');
    expect(pre.textContent).toContain('\n'); // indented, multi-line
  });
  it('renders a table', () => {
    render(
      <ToolResultView
        parsed={{ format: 'table', view: { headers: ['PORT', 'STATE'], rows: [['22', 'open']] } }}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'PORT' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '22' })).toBeInTheDocument();
  });
  it('renders key/value pairs', () => {
    render(
      <ToolResultView parsed={{ format: 'keyvalue', view: { pairs: [{ key: 'Host', value: 'up' }] } }} />,
    );
    expect(screen.getByText('Host')).toBeInTheDocument();
    expect(screen.getByText('up')).toBeInTheDocument();
  });
  it('renders plain text lines', () => {
    render(<ToolResultView parsed={{ format: 'text', view: { lines: ['line one', 'line two'] } }} />);
    expect(screen.getByLabelText('tool-result-text').textContent).toContain('line one');
  });
  it('shows a placeholder when there is no parsed output', () => {
    render(<ToolResultView parsed={null} />);
    expect(screen.getByText(/no output/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm nx test frontend --testFile=tool-result-view.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/features/runner/tool-result-view.tsx
export interface ParsedToolOutput {
  format: 'json' | 'table' | 'keyvalue' | 'text' | string;
  view: unknown;
}

interface TableView {
  headers: string[];
  rows: string[][];
}
interface KeyValueView {
  pairs: { key: string; value: string }[];
}
interface TextView {
  lines: string[];
}

export function ToolResultView({ parsed }: { parsed: ParsedToolOutput | null | undefined }) {
  if (!parsed || parsed.view == null) {
    return <p className="text-slate-500 text-sm">No output.</p>;
  }

  if (parsed.format === 'json') {
    return (
      <pre
        aria-label="tool-result-json"
        className="overflow-x-auto rounded bg-space-900 p-3 text-xs text-slate-200 font-mono"
      >
        {JSON.stringify(parsed.view, null, 2)}
      </pre>
    );
  }

  if (parsed.format === 'table') {
    const v = parsed.view as TableView;
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="text-slate-400">
              {v.headers.map((h, i) => (
                <th key={i} className="px-3 py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-slate-200">
            {v.rows.map((row, ri) => (
              <tr key={ri} className="border-t border-space-800">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (parsed.format === 'keyvalue') {
    const v = parsed.view as KeyValueView;
    return (
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        {v.pairs.map((p, i) => (
          <div key={i} className="contents">
            <dt className="text-slate-400">{p.key}</dt>
            <dd className="text-slate-200 font-mono break-all">{p.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  // text (and any unknown format) — render lines.
  const lines = ((parsed.view as TextView).lines ?? []).join('\n');
  return (
    <pre
      aria-label="tool-result-text"
      className="overflow-x-auto rounded bg-space-900 p-3 text-xs text-slate-200 font-mono whitespace-pre-wrap"
    >
      {lines}
    </pre>
  );
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm nx test frontend --testFile=tool-result-view.spec.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/runner/tool-result-view.tsx apps/frontend/src/features/runner/__tests__/tool-result-view.spec.tsx
git commit -m "feat(runner-ui): generic ToolResultView (json/table/keyvalue/text)"
```

---

## Task 4: `KaliRunnerPage` (command-builder)

**Files:**
- Create: `apps/frontend/src/features/runner/kali-runner-page.tsx`
- Test: `apps/frontend/src/features/runner/__tests__/kali-runner-page.test.tsx`

Read `features/cockpit/cockpit-command-bar.tsx` + its spec first — mirror its `useQuery`(catalogue) + `useMutation` + `useScope` + MockedProvider approach. For navigation use `useNavigate()` from react-router-dom.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/features/runner/__tests__/kali-runner-page.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  KALI_TOOLS_QUERY,
  KALI_TOOL_QUERY,
  RUN_KALI_TOOL_MUTATION,
} from '../../../lib/graphql/queries';
import { KaliRunnerPage } from '../kali-runner-page';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('../../../lib/scope-context', () => ({ useScope: () => ({ engagementId: 'e1' }) }));

const toolsMock = {
  request: { query: KALI_TOOLS_QUERY },
  result: {
    data: {
      kaliTools: [
        { binary: 'nmap', package: 'nmap', displayName: 'nmap', description: 'Network mapper', categories: ['information-gathering'], hasHelp: true, optionCount: 2 },
      ],
    },
  },
};
const toolMock = {
  request: { query: KALI_TOOL_QUERY, variables: { binary: 'nmap' } },
  result: {
    data: {
      kaliTool: {
        binary: 'nmap', displayName: 'nmap', description: 'Network mapper',
        homepage: 'https://nmap.org', helpTextRaw: 'Usage: nmap ...', parseConfidence: 'low',
        manAvailable: true, options: [{ flag: '-sV', argHint: null, description: 'version detect' }],
      },
    },
  },
};

describe('<KaliRunnerPage />', () => {
  it('lists tools, selects one, composes argv and runs', async () => {
    const runMock = {
      request: {
        query: RUN_KALI_TOOL_MUTATION,
        variables: { input: { engagementId: 'e1', binary: 'nmap', args: ['-sV', 'scanme.example.com'], jsonOutput: false } },
      },
      result: { data: { runKaliTool: { id: 'r1', binary: 'nmap', args: ['-sV', 'scanme.example.com'], status: 'PENDING' } } },
    };
    render(
      <MemoryRouter>
        <MockedProvider mocks={[toolsMock, toolMock, runMock]} addTypename={false}>
          <KaliRunnerPage />
        </MockedProvider>
      </MemoryRouter>,
    );
    // pick the tool
    fireEvent.click(await screen.findByRole('button', { name: /nmap/i }));
    // type args
    fireEvent.change(await screen.findByLabelText('kali-args'), {
      target: { value: '-sV scanme.example.com' },
    });
    // run
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/runner/r1'));
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm nx test frontend --testFile=kali-runner-page.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/features/runner/kali-runner-page.tsx
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { useScope } from '../../lib/scope-context';
import {
  KALI_TOOLS_QUERY,
  KALI_TOOL_QUERY,
  RUN_KALI_TOOL_MUTATION,
} from '../../lib/graphql/queries';
import { tokenizeArgs } from './tokenize-args';

interface KaliToolSummary {
  binary: string;
  displayName: string;
  description: string;
  categories: string[];
  hasHelp: boolean;
}
interface KaliToolOption {
  flag: string;
  argHint: string | null;
  description: string;
}
interface KaliToolDetail {
  binary: string;
  displayName: string;
  description: string;
  homepage: string | null;
  helpTextRaw: string | null;
  options: KaliToolOption[];
}

const JSON_OPT_RE = /json|-oj\b|--?o\s*json/i;

export function KaliRunnerPage() {
  const { engagementId } = useScope();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [argsText, setArgsText] = useState('');
  const [jsonOutput, setJsonOutput] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const { data: toolsData } = useQuery<{ kaliTools: KaliToolSummary[] }>(KALI_TOOLS_QUERY);
  const { data: detailData } = useQuery<{ kaliTool: KaliToolDetail | null }>(KALI_TOOL_QUERY, {
    skip: !selected,
    variables: selected ? { binary: selected } : undefined,
  });
  const [runKaliTool, { loading, error }] = useMutation(RUN_KALI_TOOL_MUTATION);

  const tools = toolsData?.kaliTools ?? [];
  const detail = detailData?.kaliTool ?? null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tools
      .filter((t) => !q || t.binary.includes(q) || t.description.toLowerCase().includes(q))
      .slice(0, 60);
  }, [tools, search]);

  const args = useMemo(() => tokenizeArgs(argsText), [argsText]);
  const jsonCapable = useMemo(
    () => (detail?.options ?? []).some((o) => JSON_OPT_RE.test(`${o.flag} ${o.description}`)),
    [detail],
  );

  const scoped = Boolean(engagementId);

  async function launch() {
    if (!engagementId || !selected) return;
    const res = await runKaliTool({
      variables: { input: { engagementId, binary: selected, args, jsonOutput } },
    });
    const run = res.data?.runKaliTool as { id: string } | undefined;
    if (run) navigate(`/runner/${run.id}`);
  }

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          Kali <span className="text-neon-cyan">Runner</span>
        </h1>
        <p className="text-sm text-slate-400">
          Compose and run any Kali tool command in an isolated container.
        </p>
      </header>

      {!scoped ? (
        <p className="text-sm text-slate-500">Sélectionne un périmètre pour lancer un outil.</p>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_2fr] gap-4">
        {/* Tool picker */}
        <section aria-label="tool-picker" className="space-y-2">
          <input
            aria-label="tool-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="chercher un outil…"
            className="w-full rounded-md border border-space-800 bg-space-900 px-2 py-1 text-sm text-slate-100 font-mono"
          />
          <ul className="max-h-96 overflow-y-auto space-y-1">
            {filtered.map((t) => (
              <li key={t.binary}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(t.binary);
                    setShowHelp(false);
                  }}
                  className={`w-full rounded px-2 py-1 text-left text-sm font-mono ${
                    selected === t.binary
                      ? 'bg-neon-cyan/15 text-neon-cyan'
                      : 'text-slate-300 hover:bg-space-800/60'
                  }`}
                >
                  {t.binary}
                  <span className="block truncate text-xs text-slate-500">{t.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Composer */}
        <section aria-label="composer" className="space-y-3">
          {detail ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-mono text-lg text-slate-100">{detail.binary}</h2>
                {detail.homepage ? (
                  <a
                    href={detail.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-neon-cyan hover:underline"
                  >
                    homepage ↗
                  </a>
                ) : null}
              </div>
              <p className="text-sm text-slate-400">{detail.description}</p>

              {detail.options.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {detail.options.slice(0, 40).map((o) => (
                    <button
                      key={o.flag}
                      type="button"
                      title={o.description}
                      onClick={() =>
                        setArgsText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${o.flag} `)
                      }
                      className="rounded border border-space-800 bg-space-900 px-2 py-0.5 text-xs font-mono text-slate-300 hover:border-neon-cyan/50"
                    >
                      {o.flag}
                      {o.argHint ? <span className="text-slate-500"> {o.argHint}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}

              <input
                aria-label="kali-args"
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder="arguments (ex. -sV scanme.example.com)"
                className="w-full rounded-md border border-space-800 bg-space-900 px-2 py-1 text-sm text-slate-100 font-mono"
              />

              {jsonCapable ? (
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    aria-label="json-output"
                    checked={jsonOutput}
                    onChange={(e) => setJsonOutput(e.target.checked)}
                  />
                  sortie JSON
                </label>
              ) : null}

              <div className="rounded bg-space-900 px-3 py-2 text-xs font-mono text-slate-300 overflow-x-auto">
                <span className="text-neon-cyan">{detail.binary}</span> {args.join(' ')}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void launch()}
                  disabled={!scoped || loading}
                  className="rounded-md bg-neon-cyan/20 px-4 py-1 text-sm text-neon-cyan hover:bg-neon-cyan/30 disabled:opacity-40"
                >
                  Run
                </button>
                {detail.helpTextRaw ? (
                  <button
                    type="button"
                    onClick={() => setShowHelp((v) => !v)}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    {showHelp ? '▾ masquer' : '▸ afficher'} l&apos;aide / man
                  </button>
                ) : null}
              </div>

              {error ? (
                <p role="alert" className="text-xs text-rose-400">
                  {error.message}
                </p>
              ) : null}

              {showHelp && detail.helpTextRaw ? (
                <pre className="max-h-72 overflow-auto rounded bg-space-900 p-3 text-xs text-slate-300 font-mono whitespace-pre-wrap">
                  {detail.helpTextRaw}
                </pre>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-500">Sélectionne un outil à gauche.</p>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm nx test frontend --testFile=kali-runner-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/runner/kali-runner-page.tsx apps/frontend/src/features/runner/__tests__/kali-runner-page.test.tsx
git commit -m "feat(runner-ui): command-builder page"
```

---

## Task 5: `KaliRunPage` (live view)

**Files:**
- Create: `apps/frontend/src/features/runner/kali-run-page.tsx`
- Test: `apps/frontend/src/features/runner/__tests__/kali-run-page.test.tsx`

Mirror `features/hunt/hunt-run-page.tsx`: `useQuery` (network-only) + `useSubscription({onData: refetch})` + `startPolling(2500)` until terminal.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/features/runner/__tests__/kali-run-page.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { KALI_TOOL_RUN_QUERY } from '../../../lib/graphql/queries';
import { KaliRunPage } from '../kali-run-page';

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ runId: 'r1' }),
}));

const runMock = {
  request: { query: KALI_TOOL_RUN_QUERY, variables: { id: 'r1' } },
  result: {
    data: {
      kaliToolRun: {
        id: 'r1', engagementId: 'e1', binary: 'nmap', args: ['-sV', 'scanme.example.com'],
        target: 'scanme.example.com', status: 'COMPLETED', outputFormat: 'json',
        parsedJson: { format: 'json', view: { host: 'up' } }, exitCode: 0,
        errorMessage: null, createdAt: '2026-08-08T00:00:00.000Z',
      },
    },
  },
};

describe('<KaliRunPage />', () => {
  it('renders the run and its parsed result', async () => {
    render(
      <MemoryRouter>
        <MockedProvider mocks={[runMock]} addTypename={false}>
          <KaliRunPage />
        </MockedProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByLabelText('tool-result-json').textContent).toContain('"host": "up"');
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm nx test frontend --testFile=kali-run-page.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/features/runner/kali-run-page.tsx
import { useEffect } from 'react';
import { useQuery, useSubscription } from '@apollo/client';
import { Link, useParams } from 'react-router-dom';
import { KALI_TOOL_RUN_QUERY, KALI_TOOL_RUN_EVENTS_SUBSCRIPTION } from '../../lib/graphql/queries';
import { ToolResultView, type ParsedToolOutput } from './tool-result-view';

interface KaliToolRun {
  id: string;
  binary: string;
  args: string[];
  target: string | null;
  status: string;
  outputFormat: string | null;
  exitCode: number | null;
  parsedJson: ParsedToolOutput | null;
  errorMessage: string | null;
  createdAt: string | null;
}

const TERMINAL = new Set(['COMPLETED', 'FAILED']);
const STEPS = ['PENDING', 'RUNNING', 'PARSING', 'COMPLETED'];

function statusBadgeClass(status: string): string {
  if (status === 'COMPLETED') return 'bg-emerald-900/40 text-emerald-300 border border-emerald-700';
  if (status === 'FAILED') return 'bg-red-900/40 text-red-300 border border-red-700';
  return 'bg-indigo-900/40 text-indigo-300 border border-indigo-700';
}

export function KaliRunPage() {
  const { runId } = useParams<{ runId: string }>();
  const { data, refetch, startPolling, stopPolling } = useQuery<{ kaliToolRun: KaliToolRun | null }>(
    KALI_TOOL_RUN_QUERY,
    { skip: !runId, variables: runId ? { id: runId } : undefined, fetchPolicy: 'network-only' },
  );

  useSubscription(KALI_TOOL_RUN_EVENTS_SUBSCRIPTION, {
    skip: !runId,
    variables: runId ? { runId } : undefined,
    onData: () => {
      void refetch();
    },
  });

  const run = data?.kaliToolRun ?? null;

  useEffect(() => {
    if (!runId) return;
    startPolling(2500);
    return () => stopPolling();
  }, [runId, startPolling, stopPolling]);

  useEffect(() => {
    if (run && TERMINAL.has(run.status)) stopPolling();
  }, [run, stopPolling]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <nav className="text-xs text-slate-400">
        <Link to="/runner" className="hover:underline">
          ← nouveau run
        </Link>
      </nav>

      {run ? (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <h1 className="font-mono text-lg text-slate-100 break-all">
                <span className="text-neon-cyan">{run.binary}</span> {run.args.join(' ')}
              </h1>
              <p className="text-xs text-slate-500">
                run <code>{run.id}</code>
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className={`rounded px-2 py-1 text-xs ${statusBadgeClass(run.status)}`}>
                {run.status}
              </span>
              {run.exitCode != null ? (
                <span className="text-slate-400">
                  exit <strong className="text-slate-200">{run.exitCode}</strong>
                </span>
              ) : null}
              {run.outputFormat ? (
                <span className="text-xs text-slate-500">{run.outputFormat}</span>
              ) : null}
            </div>
          </header>

          {/* step indicator */}
          <ol className="flex items-center gap-2 text-xs">
            {STEPS.map((s) => {
              const reached =
                STEPS.indexOf(s) <= STEPS.indexOf(run.status) || run.status === 'FAILED';
              return (
                <li
                  key={s}
                  className={`rounded px-2 py-0.5 ${
                    reached ? 'bg-space-800 text-slate-200' : 'text-slate-600'
                  }`}
                >
                  {s.toLowerCase()}
                </li>
              );
            })}
          </ol>

          {run.errorMessage ? (
            <p role="alert" className="text-sm text-rose-400">
              {run.errorMessage}
            </p>
          ) : null}

          <section aria-label="result" className="space-y-2">
            <h2 className="text-sm font-medium text-slate-300">Résultat</h2>
            <ToolResultView parsed={run.parsedJson} />
          </section>
        </>
      ) : (
        <p className="text-slate-400">Chargement…</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm nx test frontend --testFile=kali-run-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/runner/kali-run-page.tsx apps/frontend/src/features/runner/__tests__/kali-run-page.test.tsx
git commit -m "feat(runner-ui): live run page"
```

---

## Task 6: Routing + nav wiring

**Files:**
- Modify: `apps/frontend/src/app-routes.tsx`
- Modify: `apps/frontend/src/components/nav-rail.tsx`
- Modify (if it asserts item count/content): `apps/frontend/src/components/__tests__/nav-rail.spec.tsx`

- [ ] **Step 1: Add the routes** — in `app-routes.tsx`, add the imports:

```ts
import { KaliRunnerPage } from './features/runner/kali-runner-page';
import { KaliRunPage } from './features/runner/kali-run-page';
```

and the two routes inside the authed `<Route element={<AppShell.../>}>` block (next to `/hunt`):

```tsx
        <Route path="/runner" element={<KaliRunnerPage />} />
        <Route path="/runner/:runId" element={<KaliRunPage />} />
```

- [ ] **Step 2: Add the nav entry** — in `nav-rail.tsx`, add to `NAV_ITEMS` after the AutoHunt entry:

```ts
  { to: '/runner', label: 'Runner', icon: '❯' },
```

- [ ] **Step 3: Update the nav-rail spec if needed** — run it first:

Run: `pnpm nx test frontend --testFile=nav-rail.spec.tsx`
If it asserts an exact item count or the exact list, update those assertions to include the new `Runner` entry (read the spec; add `/runner` where the others are asserted). If it only checks rendering generically, no change needed. Re-run → PASS.

- [ ] **Step 4: Verify routing + type-check + full frontend suite**

Run: `pnpm nx type-check frontend` → PASS.
Run: `pnpm nx test frontend --skip-nx-cache` → whole frontend suite green (paste the summary; includes `app-routing.test.tsx` — if it enumerates routes, ensure it still passes / update if it asserts an exact route set).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app-routes.tsx apps/frontend/src/components/nav-rail.tsx apps/frontend/src/components/__tests__/nav-rail.spec.tsx
git commit -m "feat(runner-ui): wire /runner routes + nav entry"
```

---

## Final verification

- [ ] `pnpm nx test frontend --skip-nx-cache` → all green (tokenizer, result view, both pages, nav).
- [ ] `pnpm nx type-check frontend` → clean.
- [ ] `pnpm nx build frontend` → builds.
- [ ] Manual note (not CI): the page is fully usable once the SP3a worker + a built `kali-toolbox` image run; without the worker, a launched run stays PENDING (expected).

---

## Self-review notes (author)

- **Spec coverage:** routes+nav → T6; 6 GraphQL ops → T1; command-builder (picker, doc/help, args chips, JSON toggle, argv preview, run) → T4; live view (query+subscription+poll, status, result) → T5; ToolResultView by format → T3; tokenizer → T2; tests → each task.
- **Type consistency:** `ParsedToolOutput` defined in `tool-result-view.tsx` (T3) and imported by `kali-run-page.tsx` (T5); `tokenizeArgs` (T2) used by the builder (T4); GraphQL op names (T1) referenced identically in T4/T5.
- **Deferred-to-implementer reads:** the nav-rail/app-routing spec assertions (T3/T6) — the implementer runs them and updates only if they assert exact counts/sets. Flagged, not a silent gap.
- **Known-simple choices:** json render is a pretty `<pre>` (structured, multi-line — not a raw one-line blob), tree view deferred; tokenizer is quote-aware but not a full shell parser (documented).
