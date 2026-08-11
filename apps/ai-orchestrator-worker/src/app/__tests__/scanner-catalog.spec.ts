import { z } from 'zod';
import { ScannerRegistry, ScannerCategory, type ScannerDefinition } from '@autoscanner/scanner-sdk';
import { NmapScanner } from '@autoscanner/scanners-nmap';

import { buildScannerCatalog, catalogToPromptText, type CatalogEntry } from '../scanner-catalog';

function makeRegistry(): ScannerRegistry {
  const registry = new ScannerRegistry();
  registry.register(NmapScanner);
  return registry;
}

/** A minimal generic Kali-style scanner def for cap/format tests. */
function fakeTool(name: string, category: ScannerCategory, description: string): ScannerDefinition {
  return {
    name,
    displayName: name,
    category: [category],
    primaryCategory: category,
    description,
    inputSchema: z.object({ args: z.string().optional() }),
    docker: {
      image: 'x',
      network: 'bridge',
      capabilities: [],
      readonlyRootfs: true,
      memoryLimitMb: 128,
      cpuQuota: 1,
      defaultTimeoutMs: 1000,
    },
    build: () => ({ cmd: [name] }),
    outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'raw' }],
    produces: [],
  };
}

describe('buildScannerCatalog', () => {
  it('maps a real scanner into a catalog entry with description + primaryCategory', () => {
    const catalog = buildScannerCatalog(makeRegistry());
    const nmap = catalog.find((e) => e.name === 'nmap');

    expect(nmap).toBeDefined();
    expect(nmap?.displayName).toBe('Nmap');
    expect(nmap?.description).toContain('port');
    expect(nmap?.primaryCategory).toBe(ScannerCategory.PORT_SCAN);
  });

  it('renders a compact `name — description` line for each shown scanner', () => {
    const text = catalogToPromptText(buildScannerCatalog(makeRegistry()));
    expect(text).toContain('nmap — ');
  });
});

describe('catalogToPromptText capping', () => {
  it('caps to the limit and appends a "+N more" note', () => {
    const entries: CatalogEntry[] = Array.from({ length: 200 }, (_, i) =>
      buildScannerCatalog(
        (() => {
          const r = new ScannerRegistry();
          r.register(fakeTool(`tool${i}`, ScannerCategory.WEB_ENUM, `web tool ${i}`));
          return r;
        })(),
      ),
    ).flat();

    const text = catalogToPromptText(entries, 60);
    const lines = text.split('\n');
    // 60 shown lines + 1 "+N more" note.
    expect(lines).toHaveLength(61);
    expect(text).toContain('+140 more tools available');
  });

  it('does not append the note when everything fits under the limit', () => {
    const r = new ScannerRegistry();
    r.register(fakeTool('only', ScannerCategory.VULN_SCAN, 'only tool'));
    const text = catalogToPromptText(buildScannerCatalog(r), 60);
    expect(text).not.toContain('more tools available');
    expect(text).toBe('only — only tool');
  });

  it('sorts recon/web/vuln scanners ahead of misc ones', () => {
    const r = new ScannerRegistry();
    r.register(fakeTool('miscy', ScannerCategory.MISC, 'misc tool'));
    r.register(fakeTool('reconny', ScannerCategory.PASSIVE_RECON, 'recon tool'));
    const text = catalogToPromptText(buildScannerCatalog(r), 60);
    expect(text.indexOf('reconny')).toBeLessThan(text.indexOf('miscy'));
  });
});
