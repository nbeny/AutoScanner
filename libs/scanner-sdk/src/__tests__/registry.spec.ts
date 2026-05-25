import { z } from 'zod';
import { ScannerRegistry } from '../registry';
import { ScannerCategory, type ScannerDefinition } from '../types';

const makeDef = (
  name: string,
  category: ScannerCategory[] = [ScannerCategory.PORT_SCAN],
): ScannerDefinition => ({
  name,
  displayName: name,
  category,
  description: `${name} test scanner`,
  inputSchema: z.object({}),
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
});

describe('ScannerRegistry', () => {
  let reg: ScannerRegistry;

  beforeEach(() => {
    reg = new ScannerRegistry();
  });

  it('registers and retrieves a scanner by name', () => {
    const def = makeDef('nmap');
    reg.register(def);
    expect(reg.has('nmap')).toBe(true);
    expect(reg.get('nmap')).toBe(def);
    expect(reg.size()).toBe(1);
  });

  it('throws on duplicate registration', () => {
    reg.register(makeDef('nmap'));
    expect(() => reg.register(makeDef('nmap'))).toThrow(/already registered/);
  });

  it('throws on get() for unknown scanner', () => {
    expect(() => reg.get('ghost')).toThrow(/not found/);
  });

  it('list() returns all by default', () => {
    reg.register(makeDef('a'));
    reg.register(makeDef('b'));
    expect(reg.list()).toHaveLength(2);
  });

  it('list() filters by category', () => {
    reg.register(makeDef('nmap', [ScannerCategory.PORT_SCAN, ScannerCategory.SERVICE_DETECTION]));
    reg.register(makeDef('subfinder', [ScannerCategory.SUBDOMAIN_ENUM]));
    expect(reg.list({ category: ScannerCategory.PORT_SCAN }).map((s) => s.name)).toEqual(['nmap']);
    expect(reg.list({ category: ScannerCategory.SUBDOMAIN_ENUM }).map((s) => s.name)).toEqual([
      'subfinder',
    ]);
    expect(reg.list({ category: ScannerCategory.WIFI })).toEqual([]);
  });
});
