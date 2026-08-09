import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const FfufInput = z.object({
  wordlist: z
    .string()
    .default('/etc/ffuf/content.txt')
    .describe('Chemin de la wordlist dans le conteneur.'),
  matchCodes: z
    .string()
    .default('200,204,301,302,307,401,403')
    .describe('Codes HTTP considérés comme des correspondances (-mc).'),
  threads: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Nombre de threads concurrents (-t). Défaut ffuf : 40.'),
  extensions: z
    .string()
    .optional()
    .describe('Extensions à fuzzer, séparées par des virgules (-e), ex. php,html,js.'),
});
export type FfufInputType = z.infer<typeof FfufInput>;

export const FfufScanner: ScannerDefinition<FfufInputType> = {
  name: 'ffuf',
  displayName: 'ffuf',
  category: [ScannerCategory.WEB_ENUM],
  description:
    'Directory/content fuzzing (ffuf) with a small bundled wordlist. Custom-built image.',
  inputSchema: FfufInput,
  docker: {
    image: 'autoscanner/ffuf:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const cmd = [
      'ffuf',
      '-u',
      `https://${target}/FUZZ`,
      '-w',
      input.wordlist,
      '-mc',
      input.matchCodes,
    ];
    if (input.threads) cmd.push('-t', String(input.threads));
    if (input.extensions) cmd.push('-e', input.extensions);
    cmd.push('-of', 'json', '-o', '/dev/stdout', '-s');
    return { cmd };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'ffuf-json' }],
  produces: ['Endpoint'],
  presets: [
    {
      id: 'quick-common',
      name: 'Rapide (codes courants)',
      description: 'Fuzzing de contenu avec les codes 200/301/302/401/403, 40 threads.',
      options: { matchCodes: '200,301,302,401,403' },
    },
    {
      id: 'files-ext',
      name: 'Fichiers (php/html/js)',
      description: 'Cherche des fichiers avec extensions communes, 80 threads.',
      options: { extensions: 'php,html,js,txt', threads: 80 },
    },
    {
      id: 'aggressive',
      name: 'Agressif (200 threads)',
      description: 'Débit maximal — à réserver aux cibles autorisées et robustes.',
      options: { threads: 200 },
    },
  ],
};
