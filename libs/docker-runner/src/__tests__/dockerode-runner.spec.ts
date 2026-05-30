import Docker = require('dockerode');
import { DockerodeRunner } from '../dockerode-runner';
import type { RunSpec } from '../types';

const ALPINE = 'alpine:3.20';

describe('DockerodeRunner (integration)', () => {
  let runner: DockerodeRunner;
  let dockerReady = false;

  beforeAll(async () => {
    try {
      await new Docker().ping();
      dockerReady = true;
    } catch (err) {
      console.warn(
        `[docker-runner] Docker daemon unreachable — tests will no-op: ${(err as Error).message}`,
      );
      return;
    }
    runner = new DockerodeRunner();
    await runner.pullIfMissing(ALPINE);
  }, 120_000);

  const guarded = (fn: () => Promise<void>) => async () => {
    if (!dockerReady) return;
    await fn();
  };

  it(
    'runs a command and streams stdout',
    guarded(async () => {
      const chunks: string[] = [];
      const spec: RunSpec = {
        image: ALPINE,
        cmd: ['sh', '-c', 'echo hello'],
        timeoutMs: 10_000,
        onStdout: (c) => chunks.push(c),
      };
      const res = await runner.run(spec);
      expect(res.exitCode).toBe(0);
      expect(res.timedOut).toBe(false);
      expect(res.killedByUser).toBe(false);
      expect(chunks.join('')).toContain('hello');
    }),
    30_000,
  );

  it(
    'rejects with a clear error when neither onStdout nor onStderr is provided',
    guarded(async () => {
      // The legacy file-capture fallback leaked a `tmpdir()` scratch dir on
      // every run. We removed it; callers must now stream. This test pins
      // the contract so a future refactor can't silently regress it.
      await expect(
        runner.run({
          image: ALPINE,
          cmd: ['sh', '-c', 'echo nope'],
          timeoutMs: 10_000,
        }),
      ).rejects.toThrow(/onStdout.*onStderr.*required/);
    }),
    10_000,
  );

  it(
    'enforces timeoutMs and marks timedOut',
    guarded(async () => {
      const res = await runner.run({
        image: ALPINE,
        cmd: ['sh', '-c', 'sleep 30'],
        timeoutMs: 2_000,
        // onStdout required since file-capture fallback was removed.
        onStdout: () => undefined,
      });
      expect(res.timedOut).toBe(true);
      expect(res.exitCode).not.toBe(0);
    }),
    20_000,
  );

  it(
    'inspect() returns exists:false for unknown image',
    guarded(async () => {
      const res = await runner.inspect('autoscanner-nonexistent-image:does-not-exist');
      expect(res.exists).toBe(false);
    }),
    30_000,
  );

  it(
    'pipes spec.stdin to container stdin and streams stdout back',
    guarded(async () => {
      const chunks: string[] = [];
      const spec: RunSpec = {
        image: ALPINE,
        cmd: ['sh', '-c', 'cat'],
        stdin: 'hello-via-stdin\n',
        timeoutMs: 10_000,
        onStdout: (c) => chunks.push(c),
      };
      const res = await runner.run(spec);
      expect(res.exitCode).toBe(0);
      expect(res.timedOut).toBe(false);
      expect(chunks.join('')).toContain('hello-via-stdin');
    }),
    30_000,
  );
});
