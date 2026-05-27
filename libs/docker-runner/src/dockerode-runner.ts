import { Injectable, Logger } from '@nestjs/common';
import Docker = require('dockerode');
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import type { DockerRunner, RunResult, RunSpec } from './types';

const DEFAULT_PIDS_LIMIT = 512;
const DEFAULT_MEMORY_MB = 2048;
const DEFAULT_CPU_QUOTA = 1_000_000;
const DEFAULT_USER = '1000:1000';
const DEFAULT_NOFILE: [number, number] = [8192, 8192];
const DEFAULT_TMPFS_SIZE = '512m';
const TMP_PREFIX = 'autoscanner-';

function toNetworkMode(network: RunSpec['network']): string {
  if (!network) return 'bridge';
  if (typeof network === 'string') return network;
  return network.name;
}

function bindsToStrings(binds: RunSpec['binds']): string[] {
  if (!binds) return [];
  return binds.map((b) => `${b.src}:${b.dst}${b.readonly ? ':ro' : ''}`);
}

function envToArray(env: RunSpec['env']): string[] {
  if (!env) return [];
  return Object.entries(env).map(([k, v]) => `${k}=${v}`);
}

@Injectable()
export class DockerodeRunner implements DockerRunner {
  private readonly logger = new Logger(DockerodeRunner.name);
  private readonly docker: Docker;

  constructor(docker?: Docker) {
    this.docker = docker ?? new Docker();
  }

  async inspect(image: string): Promise<{ exists: boolean; digest?: string }> {
    try {
      const info = await this.docker.getImage(image).inspect();
      const digest = info.RepoDigests?.[0];
      return { exists: true, digest };
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) {
        return { exists: false };
      }
      throw err;
    }
  }

  async pullIfMissing(image: string): Promise<void> {
    const { exists } = await this.inspect(image);
    if (exists) return;
    this.logger.log(`Pulling image ${image}`);
    const stream = await this.docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  async run(spec: RunSpec): Promise<RunResult> {
    const start = Date.now();
    const streaming = Boolean(spec.onStdout || spec.onStderr);

    let stdoutPath: string | undefined;
    let stderrPath: string | undefined;
    let stdoutFile: WriteStream | undefined;
    let stderrFile: WriteStream | undefined;

    if (!streaming) {
      const scratch = join(tmpdir(), `${TMP_PREFIX}${randomUUID()}`);
      await mkdir(scratch, { recursive: true });
      stdoutPath = join(scratch, 'stdout.log');
      stderrPath = join(scratch, 'stderr.log');
      stdoutFile = createWriteStream(stdoutPath);
      stderrFile = createWriteStream(stderrPath);
    }

    const useStdin = spec.stdin !== undefined;

    const container = await this.docker.createContainer({
      Image: spec.image,
      Cmd: spec.cmd,
      Env: envToArray(spec.env),
      WorkingDir: spec.workingDir,
      User: spec.user ?? DEFAULT_USER,
      Tty: false,
      AttachStdout: true,
      AttachStderr: true,
      ...(useStdin ? { AttachStdin: true, OpenStdin: true, StdinOnce: true } : {}),
      HostConfig: {
        NetworkMode: toNetworkMode(spec.network),
        Binds: bindsToStrings(spec.binds),
        CapDrop: spec.capabilities?.drop ?? ['ALL'],
        CapAdd: spec.capabilities?.add ?? [],
        ReadonlyRootfs: spec.readonlyRootfs ?? true,
        SecurityOpt: ['no-new-privileges'],
        PidsLimit: spec.pidsLimit ?? DEFAULT_PIDS_LIMIT,
        Memory: (spec.memoryLimitMb ?? DEFAULT_MEMORY_MB) * 1024 * 1024,
        NanoCpus: (spec.cpuQuota ?? DEFAULT_CPU_QUOTA) * 1000,
        Ulimits: (
          spec.ulimits ?? [{ name: 'nofile', soft: DEFAULT_NOFILE[0], hard: DEFAULT_NOFILE[1] }]
        ).map((u) => ({ Name: u.name, Soft: u.soft, Hard: u.hard })),
        Tmpfs: { '/tmp': `size=${DEFAULT_TMPFS_SIZE}` },
        AutoRemove: false,
      },
    });

    const stdout = new PassThrough();
    const stderr = new PassThrough();

    if (streaming) {
      if (spec.onStdout) stdout.on('data', (c: Buffer) => spec.onStdout?.(c.toString('utf8')));
      if (spec.onStderr) stderr.on('data', (c: Buffer) => spec.onStderr?.(c.toString('utf8')));
    } else {
      stdout.pipe(stdoutFile!);
      stderr.pipe(stderrFile!);
    }

    const attachOpts: Docker.ContainerAttachOptions = {
      stream: true,
      stdout: true,
      stderr: true,
      ...(useStdin ? { stdin: true, hijack: true } : {}),
    };
    const stream = await container.attach(attachOpts);
    container.modem.demuxStream(stream, stdout, stderr);

    let timedOut = false;
    let killedByUser = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      container.kill().catch(() => undefined);
    }, spec.timeoutMs);

    const onAbort = () => {
      killedByUser = true;
      container.kill().catch(() => undefined);
    };
    spec.abortSignal?.addEventListener('abort', onAbort, { once: true });

    let exitCode = -1;
    try {
      await container.start();
      if (useStdin) {
        (stream as NodeJS.WritableStream).write(spec.stdin as string, 'utf8');
        (stream as NodeJS.WritableStream).end();
      }
      const result = await container.wait();
      exitCode = typeof result?.StatusCode === 'number' ? result.StatusCode : -1;
    } catch (err) {
      this.logger.error(`Container ${container.id} failed`, err as Error);
      throw err;
    } finally {
      clearTimeout(timeout);
      spec.abortSignal?.removeEventListener('abort', onAbort);

      await new Promise<void>((resolve) => {
        stream.on('end', () => resolve());
        stream.on('close', () => resolve());
        setTimeout(resolve, 100);
      });

      stdoutFile?.end();
      stderrFile?.end();

      try {
        await container.remove({ force: true });
      } catch (err) {
        this.logger.warn(`Failed to remove container ${container.id}: ${(err as Error).message}`);
      }
    }

    spec.onExit?.(exitCode);

    return {
      exitCode,
      durationMs: Date.now() - start,
      containerId: container.id,
      stdoutPath,
      stderrPath,
      timedOut,
      killedByUser,
    };
  }
}
