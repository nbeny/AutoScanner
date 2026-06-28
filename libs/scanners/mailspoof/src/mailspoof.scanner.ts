import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const MailspoofInput = z.object({});
export type MailspoofInputType = z.infer<typeof MailspoofInput>;

export const MailspoofScanner: ScannerDefinition<MailspoofInputType> = {
  name: 'mailspoof',
  displayName: 'mailspoof (DMARC/SPF/DKIM lint)',
  category: [ScannerCategory.OSINT, ScannerCategory.SMTP],
  description:
    'Passive DMARC / SPF / DKIM record lint (chenjj/mailspoof). Emits granular findings ' +
    'per missing or weak record. No credentials needed.',
  inputSchema: MailspoofInput,
  docker: {
    image: 'autoscanner/mailspoof:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    return { cmd: ['python', '/opt/mailspoof/mailspoof.py', '-d', target, '-o', 'json'] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'mailspoof-json' }],
  produces: ['OrgMetadata', 'Finding'],
};
