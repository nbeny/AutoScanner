import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const H8mailInput = z.object({
  emails: z.array(z.string().min(1)).default([]),
});
export type H8mailInputType = z.infer<typeof H8mailInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const H8mailScanner: ScannerDefinition<H8mailInputType> = {
  name: 'h8mail',
  displayName: 'h8mail',
  category: [ScannerCategory.BREACH_INTEL, ScannerCategory.IDENTITY_OSINT],
  description:
    'Email breach hunter (h8mail) in key-free mode: checks free breach sources for the ' +
    'supplied emails and reports exposed breaches. Zero API keys required.',
  inputSchema: H8mailInput,
  docker: {
    image: 'autoscanner/h8mail:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const emails = input.emails.length > 0 ? input.emails : [target];
    const args = emails.map(shEscape).join(' ');
    const script =
      `printf '%s\\n' ${args} > /tmp/targets.txt && ` +
      `h8mail -t /tmp/targets.txt --json /out/result.json >/dev/null 2>&1 || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: { path: '/out/result.json' }, parser: 'h8mail-json' }],
  produces: ['BreachExposure'],
};
