import { z } from 'zod';
import { ScannerRegistry, type ScannerDefinition } from '@autoscanner/scanner-sdk';
import { ScannerCategory } from '@autoscanner/scanner-sdk';

import { ScannerCatalogService } from '../scanner-catalog.service';
import { KaliCatalogService } from '../kali-catalog.service';
import type { KaliToolRecord } from '../kali/types';

function makeRecord(binary: string, overrides: Partial<KaliToolRecord> = {}): KaliToolRecord {
  return {
    package: binary,
    binary,
    displayName: binary,
    description: '',
    homepage: null,
    categories: [],
    helpTextRaw: null,
    options: [],
    parseConfidence: 'none',
    manAvailable: false,
    manTextRaw: null,
    optionsSource: 'none',
    source: 'kali-docker',
    kaliRelease: 'seed',
    capturedAt: 't',
    ...overrides,
  };
}

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

    const kali = new KaliCatalogService([]);
    const svc = new ScannerCatalogService(registry, kali);
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

  it('sets kaliToolRef from dataset match, override, or null', () => {
    const registry = new ScannerRegistry();
    registry.register(makeDef('nmap')); // dataset has "nmap"
    registry.register(makeDef('smb-enum')); // override -> enum4linux-ng (in dataset)
    registry.register(makeDef('shodan', { inputSchema: z.object({}) })); // not a Kali binary

    const kali = new KaliCatalogService([makeRecord('nmap'), makeRecord('enum4linux-ng')]);

    const catalog = new ScannerCatalogService(registry, kali).catalog();
    const byName = (n: string) => catalog.find((c) => c.name === n)!;
    expect(byName('nmap').kaliToolRef).toBe('nmap');
    expect(byName('smb-enum').kaliToolRef).toBe('enum4linux-ng');
    expect(byName('shodan').kaliToolRef).toBeNull();
  });

  it('expose primaryCategory (primaryCategory sinon category[0])', () => {
    const registry = new ScannerRegistry();
    registry.register(makeDef('nmap'));

    const kali = new KaliCatalogService([]);
    const service = new ScannerCatalogService(registry, kali);
    const entries = service.catalog();
    const nmap = entries.find((e) => e.name === 'nmap');
    expect(nmap?.primaryCategory).toBeTruthy();
    expect(entries.every((e) => typeof e.primaryCategory === 'string')).toBe(true);
  });

  it('expose presets (tableau, vide sans record Kali)', () => {
    const registry = new ScannerRegistry();
    registry.register(makeDef('nmap'));

    const kali = new KaliCatalogService([]);
    const service = new ScannerCatalogService(registry, kali);
    const entries = service.catalog();
    expect(entries.every((e) => Array.isArray(e.presets))).toBe(true);
    // No Kali record => no examples to derive.
    expect(entries.find((e) => e.name === 'nmap')!.presets).toEqual([]);
  });

  it('émet des exemples de run éditables (seed pour nmap, fallback pour un outil obscur)', () => {
    const registry = new ScannerRegistry();
    registry.register(makeDef('nmap'));
    registry.register(makeDef('zzz-obscure'));

    const kali = new KaliCatalogService([makeRecord('nmap'), makeRecord('zzz-obscure')]);
    const entries = new ScannerCatalogService(registry, kali).catalog();

    const nmapPresets = entries.find((e) => e.name === 'nmap')!.presets as Array<{
      id: string;
      name: string;
      options: { args: string };
    }>;
    expect(nmapPresets.length).toBeGreaterThan(0);
    // Seed case: first example prefills args (flags only, target auto-appended).
    expect(nmapPresets[0].options.args).toBe('-T4 --top-ports 1000');
    expect(nmapPresets.every((p) => typeof p.options.args === 'string')).toBe(true);

    const obscurePresets = entries.find((e) => e.name === 'zzz-obscure')!.presets as Array<{
      name: string;
      options: { args: string };
    }>;
    // Fallback case: a single generic "Défaut" example with empty args.
    expect(obscurePresets).toHaveLength(1);
    expect(obscurePresets[0].name).toBe('Défaut');
    expect(obscurePresets[0].options.args).toBe('');
  });

  it('respecte un scanner.presets explicite plutôt que les exemples Kali', () => {
    const registry = new ScannerRegistry();
    registry.register(
      makeDef('nmap', {
        presets: [{ id: 'custom', name: 'Custom', description: 'x', options: { ports: '80' } }],
      }),
    );

    const kali = new KaliCatalogService([makeRecord('nmap')]);
    const entries = new ScannerCatalogService(registry, kali).catalog();
    const presets = entries.find((e) => e.name === 'nmap')!.presets as Array<{ id: string }>;
    expect(presets).toHaveLength(1);
    expect(presets[0].id).toBe('custom');
  });
});
