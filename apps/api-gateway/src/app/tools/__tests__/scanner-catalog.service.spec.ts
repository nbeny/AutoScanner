import { z } from 'zod';
import { ScannerRegistry, type ScannerDefinition } from '@autoscanner/scanner-sdk';
import { ScannerCategory } from '@autoscanner/scanner-sdk';

import { ScannerCatalogService } from '../scanner-catalog.service';

function makeDef(name: string, overrides: Partial<ScannerDefinition> = {}): ScannerDefinition {
  return {
    name,
    displayName: name,
    category: [ScannerCategory.PORT_SCAN],
    description: `${name} test scanner`,
    inputSchema: z.object({ ports: z.string().default('1-1000') }),
    docker: {
      image: `${name}:latest`,
      network: 'bridge',
      capabilities: [],
      readonlyRootfs: true,
      memoryLimitMb: 512,
      cpuQuota: 500_000,
      defaultTimeoutMs: 60_000,
    },
    build: () => ({ cmd: [name] }),
    outputs: [{ format: 'JSON', capture: 'stdout', parser: `${name}-json` }],
    produces: ['Asset'],
    ...overrides,
  };
}

describe('ScannerCatalogService', () => {
  it('maps every registered scanner with its option fields, sorted by name', () => {
    const registry = new ScannerRegistry();
    registry.register(makeDef('nmap'));
    registry.register(makeDef('amass'));
    registry.register(
      makeDef('shodan', { inputSchema: z.object({}), requiresCredential: 'SHODAN' }),
    );

    const svc = new ScannerCatalogService(registry);
    const catalog = svc.catalog();

    expect(catalog.map((c) => c.name)).toEqual(['amass', 'nmap', 'shodan']);

    const nmap = catalog.find((c) => c.name === 'nmap')!;
    expect(nmap.fields).toEqual([
      expect.objectContaining({ name: 'ports', type: 'string', default: '1-1000' }),
    ]);

    const shodan = catalog.find((c) => c.name === 'shodan')!;
    expect(shodan.requiresCredential).toBe('SHODAN');
    expect(shodan.fields).toEqual([]);
  });
});
