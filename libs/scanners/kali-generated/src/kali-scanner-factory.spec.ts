import { ScannerCategory } from '@autoscanner/scanner-sdk';
import { KALI_TOOLBOX_IMAGE } from '@autoscanner/common';
import { buildKaliScanner, buildKaliScanners } from './kali-scanner-factory';
import type { KaliToolRecord } from './types';

const rec = (over: Partial<KaliToolRecord> = {}): KaliToolRecord => ({
  package: 'nmap',
  binary: 'nmap',
  displayName: 'nmap',
  description: 'Network mapper',
  categories: ['information-gathering'],
  kaliRelease: '2025.1',
  ...over,
});

describe('buildKaliScanner', () => {
  it('maps a record to a toolbox-backed raw scanner', () => {
    const def = buildKaliScanner(rec());
    expect(def.name).toBe('nmap');
    expect(def.docker.image).toBe(KALI_TOOLBOX_IMAGE);
    expect(def.outputs).toEqual([{ format: 'TEXT', capture: 'stdout', parser: 'raw' }]);
    expect(def.produces).toEqual([]);
    expect(def.category).toContain(ScannerCategory.PASSIVE_RECON);
  });

  it('grants NET_RAW/NET_ADMIN to raw-socket tools', () => {
    expect(buildKaliScanner(rec({ binary: 'nmap' })).docker.capabilities).toEqual([
      'NET_RAW',
      'NET_ADMIN',
    ]);
    expect(buildKaliScanner(rec({ binary: 'whois' })).docker.capabilities).toEqual([]);
  });

  it('falls back to MISC for unknown categories', () => {
    const def = buildKaliScanner(rec({ binary: 'foo', categories: ['nonexistent-cat'] }));
    expect(def.category).toEqual([ScannerCategory.MISC]);
  });

  it('build(): appends target when no placeholder', () => {
    const def = buildKaliScanner(rec());
    expect(def.build({ args: '-sV' }, 'example.com', {} as never).cmd).toEqual([
      'nmap',
      '-sV',
      'example.com',
    ]);
  });

  it('build(): substitutes the {{target}} placeholder', () => {
    const def = buildKaliScanner(rec());
    expect(def.build({ args: '-u {{target}} --json' }, 'https://x', {} as never).cmd).toEqual([
      'nmap',
      '-u',
      'https://x',
      '--json',
    ]);
  });

  it('build(): no target and no args yields just the binary', () => {
    const def = buildKaliScanner(rec());
    expect(def.build({}, '', {} as never).cmd).toEqual(['nmap']);
  });
});

describe('buildKaliScanners', () => {
  it('dedups by binary', () => {
    const defs = buildKaliScanners([rec(), rec({ package: 'nmap-dup' })]);
    expect(defs).toHaveLength(1);
  });
});
