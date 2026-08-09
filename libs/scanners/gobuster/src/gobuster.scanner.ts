import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const GobusterInput = z.object({
  wordlist: z
    .string()
    .default('/etc/gobuster/content.txt')
    .describe('Chemin de la wordlist dans le conteneur.'),
  threads: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Nombre de threads concurrents (-t). Défaut gobuster : 10.'),
  extensions: z
    .string()
    .optional()
    .describe('Extensions à tester, séparées par des virgules (-x), ex. php,html,js.'),
});
export type GobusterInputType = z.infer<typeof GobusterInput>;

export const GobusterScanner: ScannerDefinition<GobusterInputType> = {
  name: 'gobuster',
  displayName: 'gobuster',
  category: [ScannerCategory.WEB_ENUM],
  description:
    'Directory brute-forcing (gobuster) with a small bundled wordlist. Custom-built image.',
  inputSchema: GobusterInput,
  docker: {
    image: 'autoscanner/gobuster:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target) {
    const cmd = ['gobuster', 'dir', '-u', `https://${target}`, '-w', input.wordlist];
    if (input.threads) cmd.push('-t', String(input.threads));
    if (input.extensions) cmd.push('-x', input.extensions);
    cmd.push('-q', '--no-color', '-o', '/dev/stdout');
    return { cmd };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'gobuster-text' }],
  produces: ['Endpoint'],
  presets: [
    {
      id: 'common-dirs',
      name: 'Répertoires courants',
      description: 'Brute-force de répertoires avec la wordlist par défaut, 10 threads.',
      options: {},
    },
    {
      id: 'with-extensions',
      name: 'Avec extensions (php/html/js)',
      description: 'Recherche des fichiers avec extensions courantes, 50 threads.',
      options: { threads: 50, extensions: 'php,html,js,txt' },
    },
  ],
};
