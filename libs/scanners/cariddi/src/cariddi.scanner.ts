import { z } from 'zod';
import {
  type ScannerDefinition,
  ScannerCategory,
  type BuildResult,
} from '@autoscanner/scanner-sdk';

const CariddiInput = z.object({
  urls: z.array(z.string().url()).default([]),
  includeAllSeverity: z.boolean().default(false),
  customSecretsFile: z.string().optional(),
});
export type CariddiInputType = z.infer<typeof CariddiInput>;

export const CariddiScanner: ScannerDefinition<CariddiInputType> = {
  name: 'cariddi',
  displayName: 'cariddi',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.VULN_SCAN],
  description:
    'Endpoint/secret/token hunter on crawled URLs (edoardottt/cariddi). Reads URL list ' +
    'on stdin. Default rule set baked into the image; overridable via customSecretsFile.',
  inputSchema: CariddiInput,
  docker: {
    image: 'autoscanner/cariddi:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 900_000,
  },
  build(input, target): BuildResult {
    const urls = input.urls.length > 0 ? input.urls : [target];
    const stdin = urls.map((u) => `${u}\n`).join('');
    const cmd = ['cariddi', '-s', '-e', '-info', '-err', '-json'];
    const result: BuildResult = { cmd, stdin };
    if (input.customSecretsFile) {
      cmd.push('-sf', '/etc/cariddi/custom-secrets.json');
      result.binds = [
        {
          src: input.customSecretsFile,
          dst: '/etc/cariddi/custom-secrets.json',
          readonly: true,
        },
      ];
    }
    return result;
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'cariddi-json' }],
  produces: ['Finding', 'Endpoint'],
};
