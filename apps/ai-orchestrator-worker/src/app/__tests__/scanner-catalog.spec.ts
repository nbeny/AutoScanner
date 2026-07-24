import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { NmapScanner } from '@autoscanner/scanners-nmap';
import { PwncatScanner } from '@autoscanner/scanners-pwncat';

import { buildScannerCatalog, catalogToPromptText } from '../scanner-catalog';

describe('buildScannerCatalog', () => {
  function makeRegistry(): ScannerRegistry {
    const registry = new ScannerRegistry();
    registry.register(NmapScanner);
    return registry;
  }

  it('maps a real scanner into a catalog entry with its produced entities', () => {
    const catalog = buildScannerCatalog(makeRegistry());
    const nmap = catalog.find((e) => e.name === 'nmap');

    expect(nmap).toBeDefined();
    // Truth per libs/scanners/nmap: produces Asset, Port, Service, Technology.
    expect(nmap?.produces).toEqual(expect.arrayContaining(['Port']));
    expect(nmap?.displayName).toBe('Nmap');
  });

  it('extracts input keys from a ZodObject schema', () => {
    const catalog = buildScannerCatalog(makeRegistry());
    const nmap = catalog.find((e) => e.name === 'nmap');
    // NmapInput is a z.object with these keys.
    expect(nmap?.inputs).toEqual(
      expect.arrayContaining(['ports', 'serviceDetection', 'timingTemplate']),
    );
  });

  it('renders a non-empty prompt text containing the scanner name', () => {
    const text = catalogToPromptText(buildScannerCatalog(makeRegistry()));
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('nmap');
    expect(text).toContain('produces:{');
  });

  it('exposes the experimental pwncat scanner to the AI (catalog + prompt text)', () => {
    const registry = new ScannerRegistry();
    registry.register(PwncatScanner);

    const catalog = buildScannerCatalog(registry);
    const pwncat = catalog.find((e) => e.name === 'pwncat');
    expect(pwncat).toBeDefined();
    expect(pwncat?.produces).toEqual(expect.arrayContaining(['Finding']));

    const text = catalogToPromptText(catalog);
    expect(text).toContain('pwncat');
  });
});
