import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const DEFAULT_TAGS = ['exposure', 'config', 'backup', 'files'];

const ExposedConfigInput = z.object({
  tags: z.array(z.string().min(1)).default(DEFAULT_TAGS),
});
export type ExposedConfigInputType = z.infer<typeof ExposedConfigInput>;

export const ExposedConfigScanner: ScannerDefinition<ExposedConfigInputType> = {
  name: 'exposed-config',
  displayName: 'exposed-config',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Nuclei preset that hunts exposed configuration, secret, backup and dotfiles ' +
    '(.env, .git/config, docker-compose.yml, *.bak, CI files) on a web host. Reuses the ' +
    'nuclei engine + nuclei-json parser.',
  inputSchema: ExposedConfigInput,
  docker: {
    image: 'projectdiscovery/nuclei:v3.9.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 1_800_000,
  },
  build(input, target) {
    const cmd = [
      'nuclei',
      '-silent',
      '-jsonl',
      '-disable-update-check',
      '-tags',
      input.tags.join(','),
    ];
    return { cmd, stdin: target };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'nuclei-json' }],
  produces: ['Finding'],
};
