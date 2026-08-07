# Kali tool runner — SP3b : frontend command-builder + live view

**Date:** 2026-08-08
**Status:** Draft (pending user review)

## Program context

Final slice of SP3 (see `2026-08-07-kali-tool-runner-sp3a-design.md`). SP3a shipped the event-driven
backend: `runKaliTool` mutation, `kaliToolRun`/`kaliToolRuns` queries, `kaliToolRunEvents`
subscription, and (from SP1) `kaliTools`/`kaliTool(binary)` catalog queries. SP3b is the **frontend
only** — an Exegol-style command-builder and a live result view. No backend changes.

## Problem

The Kali runner backend exists but has no UI. The operator can't discover tools, read their help,
compose a command, run it, or see the parsed result. SP3b builds that, reusing the existing live-view
pattern (`apps/frontend/src/features/hunt/hunt-run-page.tsx`: `useSubscription({onData: refetch})` +
`useQuery` with a polling fallback).

## Goals

- **Command-builder** page: pick a Kali tool (search over `kaliTools`), read its doc/help
  (`kaliTool(binary)` — description, homepage, `helpTextRaw`, best-effort `options[]`), compose an
  argv, optionally request JSON output, and run it (`runKaliTool`).
- **Live run** page: subscribe to `kaliToolRunEvents(runId)` (refetch on each event) + poll fallback,
  showing status progression and the **parsed result rendered by format** — never a raw JSON blob.
- Reuse existing app styling and the hunt live-view pattern; every GraphQL op added to
  `lib/graphql/queries.ts`.

## Non-goals (YAGNI)

- No backend changes (SP3a API is fixed).
- No bespoke per-tool result widgets — generic renderers per `format` (json/table/keyvalue/text).
- No shell parsing beyond a simple whitespace/quote tokenizer (the backend receives an argv array).
- No editing/re-running history management beyond a list + "run again pre-fills the builder" (nice-to-have, optional).

## Design

### Routes & navigation

- `/runner` → `KaliRunnerPage` (command-builder). `/runner/:runId` → `KaliRunPage` (live view).
  Mirrors `/hunt` + `/hunt/:aiRunId`. Register in the app router; add a nav entry ("Runner", near
  Recon/Hunt). Both require an authenticated session (redirect to `/login`) like hunt.

### 1. GraphQL client ops (`apps/frontend/src/lib/graphql/queries.ts`)

Add:
- `KALI_TOOLS_QUERY` → `kaliTools { binary package displayName description categories hasHelp optionCount }`
- `KALI_TOOL_QUERY($binary)` → `kaliTool(binary) { binary displayName description homepage helpTextRaw options { flag argHint description } parseConfidence manAvailable }`
- `RUN_KALI_TOOL_MUTATION($input)` → `runKaliTool(input) { id binary args status }`
- `KALI_TOOL_RUN_QUERY($id)` → `kaliToolRun(id) { id engagementId binary args target status outputFormat exitCode parsedJson errorMessage createdAt }`
- `KALI_TOOL_RUNS_QUERY($engagementId)` → same fields, list.
- `KALI_TOOL_RUN_EVENTS_SUBSCRIPTION($runId)` → `kaliToolRunEvents(runId) { type status message }`

### 2. Command-builder — `KaliRunnerPage` (`features/runner/kali-runner-page.tsx`)

- **Scope**: read `useScope()` (like cockpit). If no engagement, show "select a scope" and disable Run.
- **Tool picker**: a search input filtering `kaliTools` (client-side over binary/description);
  results as a selectable list grouped by category. Selecting a tool loads `kaliTool(binary)`.
- **Doc panel**: shows `description`, a homepage link (opens in a new tab, `rel="noopener noreferrer"`),
  and a collapsible **help/man panel** rendering `helpTextRaw` in a scrollable `<pre>` — the "know its
  manual" requirement.
- **Args composer**:
  - A free-text args input (tokenized client-side into `args[]`, see §4).
  - The tool's `options[]` shown as clickable chips (flag + argHint + description tooltip); clicking a
    chip appends its `flag` (and a placeholder for `argHint`) to the args input.
  - A **"JSON output"** toggle, shown only when an option looks JSON-capable (heuristic: a flag/desc
    matching `/json|-oj\b|--?o\s*json/i`); enabling it appends that flag to args. Assisted, never
    silently injected (SP3 decision).
  - Live **argv preview**: `binary arg1 arg2 …` (monospace).
- **Run**: `runKaliTool({ engagementId, binary, args, jsonOutput })` → on success navigate to
  `/runner/${id}`. Surface `ForbiddenException`/`NotFoundException` messages inline (allowlist / scope
  / ownership rejections from SP3a).

### 3. Live run — `KaliRunPage` (`features/runner/kali-run-page.tsx`)

Mirror `hunt-run-page.tsx`:
- `useQuery(KALI_TOOL_RUN_QUERY, { variables: { id: runId }, fetchPolicy: 'network-only' })`.
- `useSubscription(KALI_TOOL_RUN_EVENTS_SUBSCRIPTION, { variables: { runId }, onData: () => refetch() })`.
- `startPolling(2500)` until status is terminal (`COMPLETED`/`FAILED`), then `stopPolling()`.
- Header: `binary` + args (monospace), status badge (reuse the hunt `statusBadgeClass` palette),
  `exitCode`, `outputFormat`. Show `errorMessage` (role="alert") when FAILED.
- A small **step indicator** reflecting status (`PENDING → RUNNING → PARSING → COMPLETED`), derived
  from `status` (no need for per-step events).
- **Result**: `<ToolResultView format={outputFormat} parsed={parsedJson} />`.

### 4. `ToolResultView` (`features/runner/tool-result-view.tsx`) — generic, by format

`parsedJson` is `{ format, view }` (from SP3a). Render by `format`:
- `json` → a readable structured view: pretty-printed, indented JSON in a `<pre>` with monospace +
  horizontal scroll (structured, not a one-line blob). (A collapsible tree is a possible enhancement;
  pretty `<pre>` is the MVP and still "not raw".)
- `table` → an HTML `<table>` from `{ headers, rows }`, wrapped in `overflow-x:auto`.
- `keyvalue` → a `<dl>` from `{ pairs: [{key, value}] }`.
- `text` → a `<pre>` joining `{ lines }`.
- Unknown/absent → "No output" placeholder.
The component receives already-parsed data; it does no parsing.

### 5. Arg tokenizer (`features/runner/tokenize-args.ts`) — pure

`tokenizeArgs(input: string): string[]` — split on whitespace, but keep `"…"`/`'…'`-quoted spans as
one token (quotes stripped). Empty → `[]`. This is a UI convenience; the server still receives a plain
argv array (no shell). Documented as intentionally simple (not full shell parsing).

## Testing

- **`tokenizeArgs`** — plain split; quoted span with spaces; mixed; empty. (pure unit)
- **`ToolResultView`** — renders each format (json/table/keyvalue/text) and the empty placeholder.
- **`KaliRunnerPage`** — lists tools from a mocked `kaliTools`; selecting loads `kaliTool`; composing
  args + Run calls `runKaliTool` with the expected argv and navigates; a rejected mutation shows the
  error. (MockedProvider + testing-library, like the existing cockpit-command-bar spec.)
- **`KaliRunPage`** — renders a mocked `kaliToolRun`; a `kaliToolRunEvents` event triggers a refetch;
  the parsed result renders per format; FAILED shows `errorMessage`. (mirror `hunt-run-page.test.tsx`)

## Rollout

Purely additive frontend: new route + feature folder + 6 GraphQL ops. No API/schema/migration
change. The page is usable as soon as the backend worker + a built `kali-toolbox` image are running;
before then, Run creates a row that stays PENDING (no worker) — acceptable, and the same as any
scan without its worker.

## Open questions (for the plan)

- Exact router registration point + nav component to edit — confirm by reading the app router and the
  nav/sidebar when writing the plan.
- Whether `parsedJson` arrives typed or as `GraphQLJSON` (unknown) on the client — treat as `unknown`
  and narrow in `ToolResultView`.
