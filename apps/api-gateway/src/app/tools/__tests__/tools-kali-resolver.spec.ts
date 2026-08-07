import { ToolsResolver } from '../tools.resolver';
import { KaliCatalogService } from '../kali-catalog.service';
import type { KaliToolRecord } from '../kali/types';

const NMAP: KaliToolRecord = {
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
  source: 'kali-docker',
  kaliRelease: 'seed',
  capturedAt: '2026-08-07T00:00:00.000Z',
};

describe('ToolsResolver (kali queries)', () => {
  const kali = new KaliCatalogService([NMAP]);
  // Other collaborators are unused by these queries.
  const resolver = new ToolsResolver({} as never, {} as never, kali);

  it('kaliTools returns summaries', () => {
    expect(resolver.kaliTools().map((t) => t.binary)).toEqual(['nmap']);
  });

  it('kaliTool returns detail or null', () => {
    expect(resolver.kaliTool('nmap')?.binary).toBe('nmap');
    expect(resolver.kaliTool('ghost')).toBeNull();
  });
});
