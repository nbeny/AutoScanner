export type NetworkMode = 'bridge' | 'host' | 'none' | { name: string };

export interface RunSpec {
  image: string;
  cmd: string[];
  env?: Record<string, string>;
  network?: NetworkMode;
  capabilities?: { add?: string[]; drop?: string[] };
  readonlyRootfs?: boolean;
  user?: string;
  workingDir?: string;
  binds?: Array<{ src: string; dst: string; readonly?: boolean }>;
  cpuQuota?: number;
  memoryLimitMb?: number;
  pidsLimit?: number;
  ulimits?: Array<{ name: string; soft: number; hard: number }>;
  timeoutMs: number;
  abortSignal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onExit?: (code: number) => void;
}

export interface RunResult {
  exitCode: number;
  durationMs: number;
  containerId: string;
  stdoutPath?: string;
  stderrPath?: string;
  timedOut: boolean;
  killedByUser: boolean;
}

export interface DockerRunner {
  run(spec: RunSpec): Promise<RunResult>;
  pullIfMissing(image: string): Promise<void>;
  inspect(image: string): Promise<{ exists: boolean; digest?: string }>;
}

export const DOCKER_RUNNER = Symbol('DOCKER_RUNNER');
