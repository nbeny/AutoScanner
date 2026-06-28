import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const EmailrepInput = z.object({});
export type EmailrepInputType = z.infer<typeof EmailrepInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const EmailrepScanner: ScannerDefinition<EmailrepInputType> = {
  name: 'emailrep',
  displayName: 'emailrep (emailrep.io reputation)',
  category: [ScannerCategory.OSINT, ScannerCategory.IDENTITY_OSINT],
  description:
    "Looks up an email address's reputation and breach exposure via emailrep.io. " +
    'Operates anonymously by default (lower quota); picks up EMAILREP_API_KEY when present.',
  inputSchema: EmailrepInput,
  requiresCredential: 'EMAILREP',
  credentialEnvVar: 'EMAILREP_API_KEY',
  docker: {
    image: 'autoscanner/emailrep:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    const email = shellQuoteSingle(target);
    const script = `emailrep --json ${email} >> /out/result.jsonl`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSONL', capture: { path: '/out/result.jsonl' }, parser: 'emailrep-jsonl' }],
  produces: ['Finding'],
};
