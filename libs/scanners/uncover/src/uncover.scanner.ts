import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const EngineEnum = z.enum(['shodan', 'censys', 'fofa', 'quake', 'hunter']);

const UncoverInput = z.object({
  query: z.string().min(1),
  engines: z.array(EngineEnum).default(['shodan', 'censys']),
  limit: z.number().int().min(1).max(10_000).default(200),
});
export type UncoverInputType = z.infer<typeof UncoverInput>;

export const UncoverScanner: ScannerDefinition<UncoverInputType> = {
  name: 'uncover',
  displayName: 'Uncover (multi-engine meta-search)',
  category: [ScannerCategory.OSINT, ScannerCategory.PASSIVE_RECON],
  description:
    'Meta-search across Shodan / Censys / FOFA / Quake / Hunter for a single dork. ' +
    "Reuses the operator's existing SHODAN, CENSYS, FOFA, QUAKE, HUNTER credentials.",
  inputSchema: UncoverInput,
  docker: {
    image: 'autoscanner/uncover:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, _target) {
    // uncover reads the following envs natively:
    //   SHODAN_API_KEY, CENSYS_API_ID, CENSYS_API_SECRET,
    //   FOFA_EMAIL, FOFA_KEY, QUAKE_TOKEN, HUNTER_API_KEY
    // scan-worker injects whichever are configured by the engagement owner;
    // missing keys cause uncover to skip that engine silently.
    const engines = input.engines.join(',');
    const script = `uncover -q ${shellQuoteSingle(input.query)} -e '${engines}' -l ${input.limit} -j 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'uncover-jsonl' }],
  produces: ['Asset'],
};
