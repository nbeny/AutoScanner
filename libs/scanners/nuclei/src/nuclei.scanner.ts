import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const NucleiSeverity = z.enum(['critical', 'high', 'medium', 'low', 'info']);

const NucleiInput = z.object({
  /**
   * Severity filter passed to nuclei via `-severity`. When omitted nuclei runs
   * all templates regardless of severity.
   */
  severity: z.array(NucleiSeverity).optional(),
  /**
   * Tag filter (e.g. `cve`, `rce`, `exposure`) passed to nuclei via `-tags`.
   * When omitted no tag filtering is applied.
   */
  tags: z.array(z.string()).optional(),
  /**
   * Specific template paths (under the nuclei-templates root inside the image)
   * passed to nuclei via repeated `-t` flags. When omitted nuclei uses its
   * default template selection.
   */
  templates: z.array(z.string()).optional(),
});

export type NucleiInputType = z.infer<typeof NucleiInput>;

export const NucleiScanner: ScannerDefinition<NucleiInputType> = {
  name: 'nuclei',
  displayName: 'nuclei',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Template-driven vulnerability scanner (ProjectDiscovery). Emits NormalizedFinding rows.',
  inputSchema: NucleiInput,
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
    const cmd: string[] = ['nuclei', '-silent', '-jsonl', '-disable-update-check'];

    if (input.severity && input.severity.length > 0) {
      cmd.push('-severity', input.severity.join(','));
    }
    if (input.tags && input.tags.length > 0) {
      cmd.push('-tags', input.tags.join(','));
    }
    if (input.templates && input.templates.length > 0) {
      // Use the short `-t` flag, repeated once per template path. Nuclei accepts
      // either `-t a -t b` or `-templates a,b`; the repeated short form keeps
      // each path unambiguous (no comma-escape concerns in template names).
      for (const tpl of input.templates) {
        cmd.push('-t', tpl);
      }
    }

    return { cmd, stdin: target };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'nuclei-json' }],
  produces: ['Finding'],
};
