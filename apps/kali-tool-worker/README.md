# kali-tool-worker

Runs an arbitrary Kali tool command on behalf of a `runKaliTool` mutation, in an
ephemeral `kali-toolbox` Docker container, and parses the captured output generically
by format (JSON / whitespace-aligned table / `key: value` blocks / plain text).

Two Kafka consumers, hosted in one Nest application context (no HTTP server):

- **run** (`security.kalitool.requested`) — resolves the `KaliToolRun`, docker-runs
  `[binary, ...args]` in `autoscanner/kali-toolbox:1.0`, captures stdout/stderr, stores
  the raw output to MinIO (`raw-outputs` bucket), then publishes
  `security.kalitool.parse.requested`.
- **parse+persist** (`security.kalitool.parse.requested`) — reads the raw output back
  from MinIO, runs `parseToolOutput`, and writes `outputFormat` + `parsedJson` +
  `COMPLETED` (or `FAILED` + `errorMessage`) onto the `KaliToolRun` row.

Each status transition is also published to Redis (`kalitool:events:<runId>`) for the
`kaliToolRunEvents` GraphQL subscription in `api-gateway` to stream live.

This mirrors the existing `scan-worker` → `parser-worker` split and the `AiRunEvents`
Redis pub/sub pattern used by AutoHunt — see the top-level `CLAUDE.md` for the general
scan-pipeline mental model.

## Running locally

1. Start infra (Postgres, Redis, MinIO, Redpanda): `pnpm dev:up`
2. Provision the Kafka topics (`security.kalitool.requested` /
   `security.kalitool.parse.requested` + their `.retry`/`.dlq` companions):
   `pnpm kafka:provision`
3. Build the `kali-toolbox` image (large — pulls `kalilinux/kali-rolling` and installs
   `kali-linux-large`; not built by default): `pnpm scanners:build`
4. Run the worker on the host: `pnpm dev:kali-tool-worker`

The worker is **not** part of the `app` Docker Compose profile — like `scan-worker` and
`parser-worker`, run it on the host so it can reach the Docker daemon and the
`localhost:19092` Kafka listener.

## Binary allowlist

Which binaries can be run via `runKaliTool` is governed by the SP1 Kali catalog dataset
(`libs/kali-catalog` / `tools/kali-catalog`), generated with `pnpm kali:catalog`. The
`api-gateway` mutation rejects any `binary` not present in that dataset — the worker
itself does not re-check the allowlist (see the plan's Task 5 note); regenerate the
dataset whenever the allowlist needs to change.

## Output format

`parsedJson` is stored as `{ format, view }` where `format` is one of `json`, `table`,
`keyvalue`, or `text` — a best-effort, tool-agnostic structuring of the raw output
rather than a tool-specific parser. The raw output itself is always kept (MinIO
`raw-outputs` bucket, key `kali/<engagementId>/<runId>.out`) so nothing is lost if the
generic parse is unhelpful for a given tool.
