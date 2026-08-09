# Plan 1 — Logs de run persistés (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre les logs de scan durables et rejouables — tout scan terminé (ou rafraîchi en cours de run) affiche sa sortie stdout+stderr, y compris les runs `kali-tool-worker` aujourd'hui muets.

**Architecture:** Les logs restent diffusés en live via Redis pub/sub (inchangé). En plus, chaque worker accumule stdout **et** stderr combinés dans un buffer borné et les écrit dans MinIO (bucket `logs`, clé déterministe `<scanJobId>.log`) par flush périodique + flush final. L'API expose une **Query** `scanJobLogHistory` qui lit ce blob. Le frontend charge d'abord l'historique (Query) puis s'abonne au live.

**Tech Stack:** NestJS 11, GraphQL code-first (@nestjs/graphql), MinIO via `@autoscanner/storage`, Redis pub/sub via `@autoscanner/log-stream`, React + Apollo Client, Vitest/Jest (`pnpm nx test <project>`).

**Référence spec:** `docs/superpowers/specs/2026-08-09-osint-recon-logs-scanner-options-design.md` § Section 2.

---

## Structure des fichiers

| Fichier | Rôle | Action |
| --- | --- | --- |
| `libs/log-stream/src/log-buffer.ts` | Buffer pur borné (append stdout/stderr → texte combiné) — testable en isolation | Create |
| `libs/log-stream/src/index.ts` | Export du buffer | Modify |
| `libs/storage/src/types.ts` | Ajout du bucket `logs` + helper `scanLogKey()` | Modify |
| `apps/scan-worker/src/app/scan-job.processor.ts` | Accumuler stdout+stderr, flush périodique + final vers MinIO | Modify |
| `apps/kali-tool-worker/src/app/kali-run.processor.ts` | Idem pour les runs Kali (aujourd'hui muets) | Modify |
| `apps/api-gateway/src/app/scans/scans.service.ts` | Méthode `getScanJobLogs()` lisant MinIO | Modify |
| `apps/api-gateway/src/app/scans/scans.resolver.ts` | Query `scanJobLogHistory` | Modify |
| `apps/frontend/src/lib/graphql/queries.ts` | Query `SCAN_JOB_LOG_HISTORY_QUERY` | Modify |
| `apps/frontend/src/features/scans/live-logs-pane.tsx` | Backfill (Query) puis live (Subscription) | Modify |

**Nommage figé** (à réutiliser tel quel dans toutes les tâches) :
- Bucket : `'logs'`. Clé : `scanLogKey(scanJobId)` → `` `${scanJobId}.log` ``.
- Query GraphQL : `scanJobLogHistory(scanJobId: ID!): String!` (nom distinct de la Subscription existante `scanJobLogs`).
- Classe buffer : `LogBuffer`, méthodes `append(stream, chunk)`, `snapshot(): string`, `byteLength: number`.

---

## Task 1 : `LogBuffer` — buffer combiné borné (pur, testable)

**Files:**
- Create: `libs/log-stream/src/log-buffer.ts`
- Test: `libs/log-stream/src/__tests__/log-buffer.spec.ts`
- Modify: `libs/log-stream/src/index.ts`

- [ ] **Step 1: Écrire le test qui échoue**

`libs/log-stream/src/__tests__/log-buffer.spec.ts` :

```ts
import { LogBuffer } from '../log-buffer';

describe('LogBuffer', () => {
  it('concatène stdout et stderr dans l’ordre d’arrivée', () => {
    const b = new LogBuffer();
    b.append('stdout', 'a');
    b.append('stderr', 'b');
    b.append('stdout', 'c');
    expect(b.snapshot()).toBe('abc');
  });

  it('expose la taille en octets UTF-8 (pas en chars)', () => {
    const b = new LogBuffer();
    b.append('stdout', 'é'); // 2 octets UTF-8
    expect(b.byteLength).toBe(2);
  });

  it('cesse d’accumuler au-delà du cap et marque la troncature une seule fois', () => {
    const b = new LogBuffer(4); // cap 4 octets
    b.append('stdout', 'abcd');
    b.append('stdout', 'efgh');
    const out = b.snapshot();
    expect(out.startsWith('abcd')).toBe(true);
    expect(out).toContain('truncated');
    // un second dépassement n’ajoute pas un 2e marqueur
    b.append('stdout', 'ijkl');
    expect(out.match(/truncated/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l’échec**

Run: `pnpm nx test log-stream --testFile=log-buffer.spec.ts`
Expected: FAIL — `Cannot find module '../log-buffer'`.

- [ ] **Step 3: Implémentation minimale**

`libs/log-stream/src/log-buffer.ts` :

```ts
import type { LogStream } from './types';

/** Cap par défaut aligné sur MAX_RAW_OUTPUT_BYTES du scan-worker (256 MiB). */
export const DEFAULT_LOG_BUFFER_BYTES = 256 * 1024 * 1024;

/**
 * Accumulateur pur de logs combinés stdout+stderr, borné en octets UTF-8.
 * Une fois le cap franchi, on cesse d’accumuler et on ajoute un unique marqueur
 * de troncature. Aucune I/O — le flush vers MinIO est la responsabilité de l’appelant.
 */
export class LogBuffer {
  private readonly chunks: string[] = [];
  private bytes = 0;
  private truncated = false;

  constructor(private readonly capBytes = DEFAULT_LOG_BUFFER_BYTES) {}

  get byteLength(): number {
    return this.bytes;
  }

  append(_stream: LogStream, chunk: string): void {
    if (this.truncated) return;
    const size = Buffer.byteLength(chunk, 'utf8');
    if (this.bytes + size > this.capBytes) {
      this.truncated = true;
      this.chunks.push(`\n[…log truncated at ${this.capBytes} bytes]`);
      return;
    }
    this.chunks.push(chunk);
    this.bytes += size;
  }

  snapshot(): string {
    return this.chunks.join('');
  }
}
```

- [ ] **Step 4: Exporter depuis l’index**

Dans `libs/log-stream/src/index.ts`, ajouter après les exports existants :

```ts
export * from './log-buffer';
```

- [ ] **Step 5: Lancer le test pour vérifier le succès**

Run: `pnpm nx test log-stream --testFile=log-buffer.spec.ts`
Expected: PASS (3 tests verts).

- [ ] **Step 6: Commit**

```bash
git add libs/log-stream/src/log-buffer.ts libs/log-stream/src/index.ts libs/log-stream/src/__tests__/log-buffer.spec.ts
git commit -m "feat(log-stream): add bounded LogBuffer for combined stdout+stderr"
```

---

## Task 2 : bucket `logs` + helper `scanLogKey`

**Files:**
- Modify: `libs/storage/src/types.ts`
- Test: `libs/storage/src/__tests__/scan-log-key.spec.ts`

- [ ] **Step 1: Écrire le test qui échoue**

`libs/storage/src/__tests__/scan-log-key.spec.ts` :

```ts
import { scanLogKey } from '../types';

describe('scanLogKey', () => {
  it('produit une clé déterministe par scanJobId', () => {
    expect(scanLogKey('abc-123')).toBe('abc-123.log');
    expect(scanLogKey('abc-123')).toBe(scanLogKey('abc-123'));
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l’échec**

Run: `pnpm nx test storage --testFile=scan-log-key.spec.ts`
Expected: FAIL — `scanLogKey` non exporté.

- [ ] **Step 3: Implémentation**

Dans `libs/storage/src/types.ts` :

Ajouter `'logs'` à l’union `StorageBucket` :

```ts
export type StorageBucket =
  | 'raw-outputs'
  | 'reports'
  | 'uploads'
  | 'pcap'
  | 'screenshots'
  | 'backups'
  | 'cve-mirror'
  | 'logs';
```

Ajouter en bas du fichier, après `rawOutputKey` :

```ts
/** Clé MinIO déterministe des logs combinés d’un scan job (bucket `logs`). */
export function scanLogKey(scanJobId: string): string {
  return `${scanJobId}.log`;
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `pnpm nx test storage --testFile=scan-log-key.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/storage/src/types.ts libs/storage/src/__tests__/scan-log-key.spec.ts
git commit -m "feat(storage): add logs bucket and deterministic scanLogKey"
```

---

## Task 3 : scan-worker — accumuler stdout+stderr et flush vers MinIO

**Files:**
- Modify: `apps/scan-worker/src/app/scan-job.processor.ts`

Contexte : le processor accumule aujourd’hui **un seul** flux (`capturedStream`) pour MinIO `raw-outputs`. On ajoute, en parallèle, un `LogBuffer` combiné écrit dans le bucket `logs`. Le live pub/sub (`safePublish`) reste inchangé.

- [ ] **Step 1: Importer LogBuffer + helpers storage**

Modifier l’import log-stream (ligne 15) :

```ts
import { LOG_STREAM_PUBLISHER, LogBuffer, type LogStreamPublisher } from '@autoscanner/log-stream';
```

Modifier l’import storage (ligne 25) :

```ts
import { OBJECT_STORAGE, rawOutputKey, scanLogKey, type ObjectStorage } from '@autoscanner/storage';
```

- [ ] **Step 2: Instancier le buffer et l’alimenter dans les callbacks docker**

Juste avant `let result: RunResult;` (≈ ligne 305), ajouter :

```ts
const logBuffer = new LogBuffer();
```

Dans l’appel `this.docker.run({ ... })` (≈ lignes 357-365), ajouter l’alimentation du buffer dans les deux callbacks — les callbacks deviennent :

```ts
onStdout: (chunk) => {
  captureChunk('stdout', chunk);
  logBuffer.append('stdout', chunk);
  safePublish('stdout', chunk);
},
onStderr: (chunk) => {
  captureChunk('stderr', chunk);
  logBuffer.append('stderr', chunk);
  safePublish('stderr', chunk);
},
```

- [ ] **Step 3: Écrire la méthode de flush best-effort**

Ajouter une méthode privée dans la classe `ScanJobProcessor` (après `reconcileParentScanStatus`) :

```ts
/**
 * Persiste les logs combinés dans MinIO (bucket `logs`). Best-effort : un échec
 * ne doit jamais faire échouer le scan — les logs sont un confort d’UX, pas le
 * résultat. Idempotent : réécrit le même objet sur retry.
 */
private async persistLogs(scanJobId: string, text: string): Promise<void> {
  try {
    await this.storage.ensureBucket('logs');
    await this.storage.putObject({
      bucket: 'logs',
      key: scanLogKey(scanJobId),
      body: Buffer.from(text, 'utf8'),
      contentType: 'text/plain; charset=utf-8',
    });
  } catch (err) {
    this.logger.warn(`scanJob=${scanJobId} log persist failed: ${(err as Error).message}`);
  }
}
```

- [ ] **Step 4: Flush périodique pendant le run + flush final garanti**

Envelopper l’appel `this.docker.run` avec un intervalle de flush. Remplacer le bloc `this.scanControlSubscriber.register(...); try { result = await this.docker.run({...}); } ... finally { this.scanControlSubscriber.unregister(...); }` de façon à ajouter un `setInterval` et son `clearInterval` :

```ts
this.scanControlSubscriber.register(payload.scanJobId, oversizeAbort);
const flushTimer = setInterval(() => {
  void this.persistLogs(payload.scanJobId, logBuffer.snapshot());
}, 3000);
try {
  result = await this.docker.run({
    ...runSpec,
    abortSignal: oversizeAbort.signal,
    onStdout: (chunk) => {
      captureChunk('stdout', chunk);
      logBuffer.append('stdout', chunk);
      safePublish('stdout', chunk);
    },
    onStderr: (chunk) => {
      captureChunk('stderr', chunk);
      logBuffer.append('stderr', chunk);
      safePublish('stderr', chunk);
    },
  });
} catch (err) {
  this.logger.error(`scanJob=${payload.scanJobId} failed: ${(err as Error).message}`);
  await this.persistLogs(payload.scanJobId, logBuffer.snapshot());
  await this.finalizeScanJob({
    where: { id: payload.scanJobId },
    data: { status: 'FAILED', completedAt: new Date(), errorMessage: (err as Error).message },
  });
  throw err;
} finally {
  clearInterval(flushTimer);
  this.scanControlSubscriber.unregister(payload.scanJobId);
}
// Flush final garanti sur le chemin succès (le chemin erreur a déjà flushé ci-dessus).
await this.persistLogs(payload.scanJobId, logBuffer.snapshot());
```

Note : garder tel quel le reste (le bloc `if (oversized)` et les branches de stockage `raw-outputs` en aval) ; le flush final ci-dessus s’exécute avant eux, ce qui est correct (on a déjà toute la sortie à ce stade).

- [ ] **Step 5: Type-check + lint du projet**

Run: `pnpm nx type-check scan-worker && pnpm nx lint scan-worker`
Expected: PASS (aucune erreur TS ; `flushTimer`/`logBuffer` utilisés).

- [ ] **Step 6: Commit**

```bash
git add apps/scan-worker/src/app/scan-job.processor.ts
git commit -m "feat(scan-worker): persist combined stdout+stderr logs to MinIO"
```

---

## Task 4 : kali-tool-worker — publier + persister les logs

**Files:**
- Modify: `apps/kali-tool-worker/src/app/kali-run.processor.ts`

Contexte : ce worker n’émet **aucun** log (pas de pub/sub, pas de persistance). Il tourne sur son propre modèle `KaliToolRun` (id = `runId`), pas `ScanJob`. On persiste dans le bucket `logs` avec `scanLogKey(runId)` — le panneau logs de la page runner Kali pourra le lire via la même Query en passant `runId`.

- [ ] **Step 1: Importer LogBuffer + scanLogKey**

Modifier l’import storage (ligne 4) :

```ts
import { OBJECT_STORAGE, scanLogKey, type ObjectStorage } from '@autoscanner/storage';
```

Ajouter l’import log-stream :

```ts
import { LogBuffer } from '@autoscanner/log-stream';
```

- [ ] **Step 2: Alimenter un LogBuffer et flush final**

Dans `process()`, après la déclaration de `capture` (≈ ligne 78), ajouter :

```ts
const logBuffer = new LogBuffer();
```

Modifier les callbacks du `this.docker.run` (lignes 84-85) :

```ts
onStdout: (c) => {
  capture(c);
  logBuffer.append('stdout', c);
},
onStderr: (c) => {
  capture(c);
  logBuffer.append('stderr', c);
},
```

Après le `putObject` des `raw-outputs` (≈ ligne 94), ajouter le flush logs best-effort :

```ts
try {
  await this.storage.ensureBucket('logs');
  await this.storage.putObject({
    bucket: 'logs',
    key: scanLogKey(runId),
    body: Buffer.from(logBuffer.snapshot(), 'utf8'),
    contentType: 'text/plain; charset=utf-8',
  });
} catch (err) {
  this.logger.warn(`kaliToolRun=${runId} log persist failed: ${(err as Error).message}`);
}
```

Et dans le `catch (err)` (≈ ligne 105), avant le `throw err;`, persister aussi ce qu’on a :

```ts
try {
  await this.storage.ensureBucket('logs');
  await this.storage.putObject({
    bucket: 'logs',
    key: scanLogKey(runId),
    body: Buffer.from(logBuffer.snapshot(), 'utf8'),
    contentType: 'text/plain; charset=utf-8',
  });
} catch { /* best-effort */ }
```

- [ ] **Step 3: Vérifier que `@autoscanner/log-stream` est atteignable**

Le module `apps/kali-tool-worker/src/app/app.module.ts` n’a pas besoin d’un provider : `LogBuffer` est une classe pure sans DI. Aucun changement de module requis.

Run: `pnpm nx type-check kali-tool-worker`
Expected: PASS.

- [ ] **Step 4: Lint**

Run: `pnpm nx lint kali-tool-worker`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/kali-tool-worker/src/app/kali-run.processor.ts
git commit -m "feat(kali-tool-worker): persist combined logs to MinIO (was silent)"
```

---

## Task 5 : API — Query `scanJobLogHistory`

**Files:**
- Modify: `apps/api-gateway/src/app/scans/scans.service.ts`
- Modify: `apps/api-gateway/src/app/scans/scans.resolver.ts`
- Test: `apps/api-gateway/src/app/scans/__tests__/scan-job-logs.service.spec.ts`

- [ ] **Step 1: Écrire le test qui échoue (service)**

`apps/api-gateway/src/app/scans/__tests__/scan-job-logs.service.spec.ts` :

```ts
import { Readable } from 'node:stream';
import { ScansService } from '../scans.service';

function streamOf(text: string): Readable {
  return Readable.from([Buffer.from(text, 'utf8')]);
}

describe('ScansService.getScanJobLogs', () => {
  it('renvoie le texte du blob MinIO', async () => {
    const storage = {
      getObject: jest.fn().mockResolvedValue({ body: streamOf('hello logs') }),
    };
    const svc = new ScansService(
      ...([] as never), // placeholder — voir note ci-dessous
    );
    (svc as unknown as { storage: unknown }).storage = storage;
    await expect(svc.getScanJobLogs('job-1')).resolves.toBe('hello logs');
    expect(storage.getObject).toHaveBeenCalledWith('logs', 'job-1.log');
  });

  it('renvoie une chaîne vide quand le blob n’existe pas', async () => {
    const storage = { getObject: jest.fn().mockRejectedValue(new Error('NoSuchKey')) };
    const svc = Object.create(ScansService.prototype) as ScansService;
    (svc as unknown as { storage: unknown }).storage = storage;
    await expect(svc.getScanJobLogs('job-x')).resolves.toBe('');
  });
});
```

Note d’implémentation pour l’ingénieur : le premier test montre l’intention mais le constructeur de `ScansService` a plusieurs dépendances. Utiliser la même approche que le second test (`Object.create(ScansService.prototype)` + injection du champ `storage`) pour les deux cas, plutôt que d’appeler le constructeur. Réécrire le premier test ainsi :

```ts
it('renvoie le texte du blob MinIO', async () => {
  const storage = { getObject: jest.fn().mockResolvedValue({ body: streamOf('hello logs') }) };
  const svc = Object.create(ScansService.prototype) as ScansService;
  (svc as unknown as { storage: unknown }).storage = storage;
  await expect(svc.getScanJobLogs('job-1')).resolves.toBe('hello logs');
  expect(storage.getObject).toHaveBeenCalledWith('logs', 'job-1.log');
});
```

- [ ] **Step 2: Lancer le test pour vérifier l’échec**

Run: `pnpm nx test api-gateway --testFile=scan-job-logs.service.spec.ts`
Expected: FAIL — `getScanJobLogs` n’existe pas.

- [ ] **Step 3: Implémenter `getScanJobLogs` dans le service**

Dans `apps/api-gateway/src/app/scans/scans.service.ts` :

1. S’assurer que le service injecte le storage. Vérifier le constructeur : s’il n’a pas déjà `@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage`, l’ajouter, avec l’import :

```ts
import { OBJECT_STORAGE, scanLogKey, type ObjectStorage } from '@autoscanner/storage';
```

2. Ajouter la méthode :

```ts
/**
 * Lit les logs combinés persistés d’un scan job depuis MinIO (bucket `logs`).
 * Renvoie '' si aucun log n’a encore été écrit (job non démarré, ou clé absente).
 */
async getScanJobLogs(scanJobId: string): Promise<string> {
  try {
    const { body } = await this.storage.getObject('logs', scanLogKey(scanJobId));
    const parts: Buffer[] = [];
    for await (const part of body) {
      parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part as string));
    }
    return Buffer.concat(parts).toString('utf8');
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `pnpm nx test api-gateway --testFile=scan-job-logs.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Ajouter la Query au resolver**

Dans `apps/api-gateway/src/app/scans/scans.resolver.ts`, ajouter dans la classe `ScansResolver` (après `scan(...)`, avant la Subscription) :

```ts
@Query(() => String, { name: 'scanJobLogHistory' })
scanJobLogHistory(
  @Args('scanJobId', { type: () => ID }) scanJobId: string,
): Promise<string> {
  return this.svc.getScanJobLogs(scanJobId);
}
```

(`Query`, `ID` et `Args` sont déjà importés dans ce fichier.)

- [ ] **Step 6: Type-check + build de la SDL (code-first)**

Run: `pnpm nx type-check api-gateway`
Expected: PASS. La SDL `schema.gql` se régénère au démarrage (code-first) ; pas d’édition manuelle.

- [ ] **Step 7: Commit**

```bash
git add apps/api-gateway/src/app/scans/scans.service.ts apps/api-gateway/src/app/scans/scans.resolver.ts apps/api-gateway/src/app/scans/__tests__/scan-job-logs.service.spec.ts
git commit -m "feat(api): add scanJobLogHistory query for log backfill"
```

---

## Task 6 : Frontend — backfill puis live dans `LiveLogsPane`

**Files:**
- Modify: `apps/frontend/src/lib/graphql/queries.ts`
- Modify: `apps/frontend/src/features/scans/live-logs-pane.tsx`

- [ ] **Step 1: Ajouter la Query GraphQL**

Dans `apps/frontend/src/lib/graphql/queries.ts`, à côté de `SCAN_JOB_LOGS_SUBSCRIPTION`, ajouter :

```ts
import { gql } from '@apollo/client'; // (déjà importé dans ce fichier)

export const SCAN_JOB_LOG_HISTORY_QUERY = gql`
  query ScanJobLogHistory($scanJobId: ID!) {
    scanJobLogHistory(scanJobId: $scanJobId)
  }
`;
```

- [ ] **Step 2: Backfill au montage, puis live**

Remplacer le contenu de `apps/frontend/src/features/scans/live-logs-pane.tsx` par :

```tsx
import { useEffect, useRef, useState } from 'react';
import { useQuery, useSubscription } from '@apollo/client';
import {
  SCAN_JOB_LOGS_SUBSCRIPTION,
  SCAN_JOB_LOG_HISTORY_QUERY,
} from '../../lib/graphql/queries';

interface LogChunk {
  scanJobId: string;
  stream: 'STDOUT' | 'STDERR';
  ts: number;
  chunk: string;
}

export function LiveLogsPane({ scanJobId }: { scanJobId: string | null }) {
  const [history, setHistory] = useState<string>('');
  const [lines, setLines] = useState<LogChunk[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // 1) Backfill : charge l’historique persisté à chaque changement de job.
  useQuery<{ scanJobLogHistory: string }>(SCAN_JOB_LOG_HISTORY_QUERY, {
    skip: !scanJobId,
    fetchPolicy: 'network-only',
    variables: scanJobId ? { scanJobId } : undefined,
    onCompleted: (data) => {
      setHistory(data.scanJobLogHistory ?? '');
      setLines([]); // repart propre : l’historique couvre déjà le passé
    },
  });

  // 2) Live : continue avec les chunks temps réel.
  useSubscription<{ scanJobLogs: LogChunk }>(SCAN_JOB_LOGS_SUBSCRIPTION, {
    skip: !scanJobId,
    variables: scanJobId ? { scanJobId } : undefined,
    onData: ({ data }) => {
      if (data.data?.scanJobLogs) {
        setLines((prev) => [...prev, data.data!.scanJobLogs]);
      }
    },
  });

  useEffect(() => {
    const el = bottomRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'auto' });
    }
  }, [lines, history]);

  if (!scanJobId) return <p className="text-slate-500 text-sm">Run a scan to see live logs.</p>;

  const empty = !history && lines.length === 0;

  return (
    <div className="bg-black/60 rounded p-3 h-72 overflow-auto font-mono text-xs">
      {empty && <p className="text-slate-500">No logs yet.</p>}
      {history && <pre className="whitespace-pre-wrap text-slate-300 m-0">{history}</pre>}
      {lines.map((l, i) => (
        <div key={i} className={l.stream === 'STDERR' ? 'text-red-300' : 'text-slate-200'}>
          {l.chunk}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint frontend**

Run: `pnpm nx type-check frontend && pnpm nx lint frontend`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/lib/graphql/queries.ts apps/frontend/src/features/scans/live-logs-pane.tsx
git commit -m "feat(frontend): backfill persisted logs before live subscription"
```

---

## Task 7 : Vérification end-to-end (manuelle)

**Files:** aucun (validation)

- [ ] **Step 1: Démarrer l’infra + workers**

Run:
```bash
pnpm dev:up
pnpm dev:workers   # scan-worker + parser-worker + kali-tool-worker
pnpm nx serve api-gateway
pnpm nx serve frontend
```
Expected: aucun `ECONNREFUSED`.

- [ ] **Step 2: Lancer un scan court et vérifier le live**

Depuis la page `/scans`, lancer un scanner rapide (ex. `whois` ou `httpx`). Le panneau logs doit se remplir pendant le run.

- [ ] **Step 3: Recharger la page sur le scan terminé**

Rafraîchir (F5), rouvrir le scan terminé. Attendu : le panneau **affiche l’historique** (via `scanJobLogHistory`) au lieu d’une boîte vide — c’est la correction du bug principal.

- [ ] **Step 4: Vérifier le blob MinIO**

Dans la console MinIO (port par défaut), bucket `logs`, il existe un objet `<scanJobId>.log` non vide contenant stdout **et** stderr.

- [ ] **Step 5: Suite de tests ciblée**

Run: `pnpm nx test log-stream && pnpm nx test storage && pnpm nx test api-gateway --testFile=scan-job-logs.service.spec.ts`
Expected: tout vert.

---

## Self-review (fait à l’écriture)

- **Couverture spec §2** : capture stderr ✔ (Task 3/4), persistance MinIO clé déterministe ✔ (Task 2/3/4), Query backfill ✔ (Task 5), frontend backfill-puis-live ✔ (Task 6), kali-tool-worker non muet ✔ (Task 4). Flush périodique + final ✔ (Task 3).
- **Placeholders** : aucun TODO/TBD ; le code de chaque step est complet. La note du Task 5 Step 1 corrige explicitement l’instanciation de test (pas un placeholder).
- **Cohérence des noms** : `scanLogKey`, bucket `'logs'`, `LogBuffer`, `getScanJobLogs`, Query `scanJobLogHistory`, `SCAN_JOB_LOG_HISTORY_QUERY` — identiques d’une tâche à l’autre.
- **Hors périmètre** : pas de migration Prisma (clé déterministe), le live pub/sub existant est inchangé.
