import { KaliCatalogService } from '../kali-catalog.service';
import type { KaliToolRecord } from '../kali/types';

function rec(over: Partial<KaliToolRecord> = {}): KaliToolRecord {
  return {
    package: 'nmap',
    binary: 'nmap',
    displayName: 'nmap',
    description: 'The Network Mapper',
    homepage: 'https://nmap.org',
    categories: ['information-gathering'],
    helpTextRaw: '  -sV   Probe',
    options: [{ flag: '-sV', argHint: null, description: 'Probe' }],
    parseConfidence: 'low',
    manAvailable: true,
    manTextRaw: null,
    optionsSource: 'help',
    source: 'kali-docker',
    kaliRelease: 'seed',
    capturedAt: '2026-08-07T00:00:00.000Z',
    ...over,
  };
}

describe('KaliCatalogService', () => {
  const svc = new KaliCatalogService([
    rec(),
    rec({
      package: 'nikto',
      binary: 'nikto',
      helpTextRaw: null,
      options: [],
      parseConfidence: 'none',
      homepage: null,
    }),
  ]);

  it('lists summaries sorted by binary with hasHelp + optionCount', () => {
    const list = svc.list();
    expect(list.map((t) => t.binary)).toEqual(['nikto', 'nmap']);
    const nmap = list.find((t) => t.binary === 'nmap')!;
    expect(nmap).toMatchObject({
      hasHelp: true,
      optionCount: 1,
      categories: ['information-gathering'],
    });
    const nikto = list.find((t) => t.binary === 'nikto')!;
    expect(nikto).toMatchObject({ hasHelp: false, optionCount: 0 });
  });

  it('returns full detail for a known binary and null otherwise', () => {
    const detail = svc.detail('nmap');
    expect(detail).toMatchObject({
      binary: 'nmap',
      helpTextRaw: '  -sV   Probe',
      options: [{ flag: '-sV' }],
      optionsSource: 'help',
      manTextRaw: null,
    });
    expect(svc.detail('ghost')).toBeNull();
  });

  it('defaults optionsSource to "none" when the record lacks it (pre-regeneration dataset)', () => {
    const legacySvc = new KaliCatalogService([
      rec({ optionsSource: undefined as unknown as KaliToolRecord['optionsSource'] }),
    ]);
    expect(legacySvc.detail('nmap')?.optionsSource).toBe('none');
  });

  it('exposes findByBinary for cross-linking', () => {
    expect(svc.findByBinary('nmap')?.package).toBe('nmap');
    expect(svc.findByBinary('ghost')).toBeNull();
  });
});
