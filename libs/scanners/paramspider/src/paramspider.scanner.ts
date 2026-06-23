import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const ParamspiderInput = z.object({});
export type ParamspiderInputType = z.infer<typeof ParamspiderInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const ParamspiderScanner: ScannerDefinition<ParamspiderInputType> = {
  name: 'paramspider',
  displayName: 'ParamSpider (archive params)',
  category: [ScannerCategory.WEB_ENUM],
  description:
    'Mines parameterised URLs for the target from the Wayback Machine (paramspider). ' +
    'Passive — queries public archives only.',
  inputSchema: ParamspiderInput,
  docker: {
    image: 'autoscanner/paramspider:1.0',
    network: 'bridge',
    capabilities: [],
    // paramspider writes results/<domain>.txt into CWD; needs a writable rootfs.
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target, ctx) {
    const out = `${ctx.scratchDir}/paramspider.txt`;
    // paramspider (PyPI rewrite) writes results/<domain>.txt relative to CWD.
    // Run in scratchDir, then flatten whatever it produced into one file.
    const script =
      `cd ${ctx.scratchDir} && paramspider -d ${shellQuoteSingle(target)} ` +
      `; cat ${ctx.scratchDir}/results/*.txt > ${out} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: { path: 'paramspider.txt' }, parser: 'urllines-text' }],
  produces: ['Endpoint'],
};
