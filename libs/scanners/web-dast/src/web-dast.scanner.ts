import { z } from 'zod';
import {
  type ScannerDefinition,
  type BuildContext,
  ScannerCategory,
  authHeaderLines,
} from '@autoscanner/scanner-sdk';

const WebDastInput = z.object({
  /** detect = high-confidence high/critical only, polite rate. aggressive = include medium, faster. */
  mode: z.enum(['detect', 'aggressive']).default('detect'),
});
export type WebDastInputType = z.infer<typeof WebDastInput>;

export const WebDastScanner: ScannerDefinition<WebDastInputType> = {
  name: 'web-dast',
  displayName: 'Web DAST fuzzing (nuclei)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Active DAST fuzzing of URL parameters with nuclei (-dast): SSRF, LFI/path-traversal, ' +
    'XXE, open-redirect and more. Blind detection via a self-hosted OAST (interactsh) when ' +
    'configured; in-band only otherwise. Actively probes the target.',
  inputSchema: WebDastInput,
  docker: {
    image: 'projectdiscovery/nuclei:v3.9.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 1_800_000,
  },
  build(input: WebDastInputType, target: string, ctx: BuildContext) {
    const severity = input.mode === 'aggressive' ? 'medium,high,critical' : 'high,critical';
    const rateLimit = input.mode === 'aggressive' ? '150' : '50';
    const cmd: string[] = [
      'nuclei',
      '-dast',
      '-silent',
      '-jsonl',
      '-disable-update-check',
      '-severity',
      severity,
      '-rate-limit',
      rateLimit,
    ];

    const oast = ctx.oast;
    if (oast?.serverUrl) {
      cmd.push('-interactsh-server', oast.serverUrl);
      if (oast.token) cmd.push('-interactsh-token', oast.token);
    } else if (!oast?.allowPublic) {
      // No self-hosted server and public not opted-in: disable OOB entirely so
      // the target's traffic never reaches a third-party collaborator.
      cmd.push('-no-interactsh');
    }
    // else: allowPublic && no serverUrl → let nuclei use its default public interactsh.

    // Authenticated fuzzing: attach session headers so nuclei reaches
    // protected endpoints. No-op when no auth is configured.
    for (const header of authHeaderLines(ctx.auth)) cmd.push('-H', header);

    return { cmd, stdin: target };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'web-dast-json' }],
  produces: ['Finding'],
};
