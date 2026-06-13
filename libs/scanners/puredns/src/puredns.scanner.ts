import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const RESOLVERS = '/etc/puredns/resolvers.txt';

const PurednsInput = z.object({
  // `bruteforce`: enumerate <wordlist>.<target> (active, additive — default in
  // recon-passive-deep). `resolve`: validate a piped host list from stdin.
  mode: z.enum(['bruteforce', 'resolve']).default('bruteforce'),
  wordlist: z.string().default('/etc/puredns/wordlist.txt'),
});

export type PurednsInputType = z.infer<typeof PurednsInput>;

export const PurednsScanner: ScannerDefinition<PurednsInputType> = {
  name: 'puredns',
  displayName: 'puredns',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.DNS],
  description: 'DNS brute-force / mass-resolve via massdns (puredns). Custom-built image.',
  inputSchema: PurednsInput,
  docker: {
    image: 'autoscanner/puredns:1.0',
    network: 'bridge',
    capabilities: [],
    // Safe despite massdns writing temp files: docker-runner always mounts
    // /tmp as tmpfs (see dockerode-runner.ts), which is where they land.
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 900_000,
  },
  build(input, target) {
    if (input.mode === 'resolve') {
      return {
        cmd: ['puredns', 'resolve', '--resolvers', RESOLVERS, '--quiet'],
        stdin: target,
      };
    }
    return {
      cmd: ['puredns', 'bruteforce', input.wordlist, target, '--resolvers', RESOLVERS, '--quiet'],
    };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hostlines-text' }],
  produces: ['Asset', 'Subdomain'],
};
