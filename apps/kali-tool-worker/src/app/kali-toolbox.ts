import type { RunSpec } from '@autoscanner/docker-runner';

export const KALI_TOOLBOX_IMAGE = 'autoscanner/kali-toolbox:1.0';
export const KALI_TOOLBOX_MEMORY_MB = 2048;
export const KALI_TOOLBOX_TIMEOUT_MS = 15 * 60 * 1000;
export const KALI_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** MinIO object key for a Kali tool run's captured output. */
export function kaliRawKey(engagementId: string, runId: string): string {
  return `kali/${engagementId}/${runId}.out`;
}

/** Base sandbox spec for a kali-toolbox run (argv supplied by the caller). */
export function kaliToolboxRunSpec(argv: string[]): Omit<RunSpec, 'onStdout' | 'onStderr'> {
  return {
    image: KALI_TOOLBOX_IMAGE,
    cmd: argv, // argv only — never a shell string
    network: 'bridge',
    capabilities: { add: [], drop: ['ALL'] },
    readonlyRootfs: true,
    memoryLimitMb: KALI_TOOLBOX_MEMORY_MB,
    timeoutMs: KALI_TOOLBOX_TIMEOUT_MS,
  };
}
