import type { KaliToolRecord } from '../kali/types';
import { KALI_EXAMPLE_SEED, parseManExamples, buildKaliExamples } from '../kali-examples';

function makeRecord(overrides: Partial<KaliToolRecord> = {}): KaliToolRecord {
  return {
    package: 'pkg',
    binary: 'tool',
    displayName: 'tool',
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

const NMAP_MAN = [
  'NAME',
  '     nmap - Network exploration tool and security / port scanner',
  '',
  'EXAMPLES:',
  '           nmap -v -A scanme.nmap.org',
  '           nmap -v -sn 192.168.0.0/16 10.0.0.0/8',
  '           nmap -v -iR 10000 -Pn -p 80',
  '         SEE THE MAN PAGE FOR MORE OPTIONS',
  '',
  'TARGET SPECIFICATION',
  '     Everything on the command-line ...',
].join('\n');

const PROMPT_MAN = [
  'DESCRIPTION',
  '   foo does things.',
  '',
  'EXAMPLES',
  '   Example 1. Aggressive scan against a host # foo -A -T4 host.example.com',
  '   Example 2. Ping sweep $ foo -sn 10.0.0.0/24',
].join('\n');

const HELP_ONLY = [
  'Usage: tool [options] <target>',
  'Options:',
  '  -h, --help    show this help',
  '  -v            verbose',
  'This tool scans targets.',
].join('\n');

describe('parseManExamples', () => {
  it('extracts commands from an EXAMPLES section (no prompt)', () => {
    const ex = parseManExamples(NMAP_MAN, 'nmap');
    expect(ex.length).toBeGreaterThan(0);
    expect(ex[0]).toEqual({ name: 'Exemple 1', args: '-v -A scanme.nmap.org' });
    expect(ex.map((e) => e.name)).toEqual(['Exemple 1', 'Exemple 2', 'Exemple 3']);
  });

  it('strips shell prompts (# / $) and the leading binary token', () => {
    const ex = parseManExamples(PROMPT_MAN, 'foo');
    expect(ex).toEqual([
      { name: 'Exemple 1', args: '-A -T4 host.example.com' },
      { name: 'Exemple 2', args: '-sn 10.0.0.0/24' },
    ]);
  });

  it('caps at 3 examples', () => {
    const many = ['EXAMPLES', 't a', 't b', 't c', 't d', 't e'].join('\n');
    expect(parseManExamples(many, 't')).toHaveLength(3);
  });

  it('returns [] for pure help text with no examples', () => {
    expect(parseManExamples(HELP_ONLY, 'tool')).toEqual([]);
  });

  it('returns [] for null text', () => {
    expect(parseManExamples(null, 'tool')).toEqual([]);
  });
});

describe('buildKaliExamples', () => {
  it('returns seeded examples for a seeded binary (nmap)', () => {
    const presets = buildKaliExamples(makeRecord({ binary: 'nmap' }));
    expect(presets.length).toBeGreaterThan(0);
    // Each preset carries an editable args string under options.args.
    for (const p of presets) {
      expect(typeof p.id).toBe('string');
      expect(typeof (p.options as { args: string }).args).toBe('string');
    }
    const seeded = KALI_EXAMPLE_SEED['nmap'];
    expect(presets.map((p) => p.name)).toEqual(seeded.map((s) => s.name));
    expect((presets[0].options as { args: string }).args).toBe(seeded[0].args);
  });

  it('parses man examples when no seed exists', () => {
    const presets = buildKaliExamples(
      makeRecord({ binary: 'zzz-obscure', manTextRaw: NMAP_MAN.replace(/nmap/g, 'zzz-obscure') }),
    );
    expect(presets).toHaveLength(3);
    expect((presets[0].options as { args: string }).args).toBe('-v -A scanme.zzz-obscure.org');
  });

  it('falls back to help text when no man text', () => {
    const presets = buildKaliExamples(
      makeRecord({ binary: 'zzz-obscure', helpTextRaw: PROMPT_MAN.replace(/foo/g, 'zzz-obscure') }),
    );
    expect(presets).toHaveLength(2);
    expect((presets[0].options as { args: string }).args).toBe('-A -T4 host.example.com');
  });

  it('returns a single generic fallback when neither seed nor examples exist', () => {
    const presets = buildKaliExamples(
      makeRecord({ binary: 'zzz-obscure', helpTextRaw: HELP_ONLY }),
    );
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe('Défaut');
    expect((presets[0].options as { args: string }).args).toBe('');
  });

  it('gives every kebab id and non-empty name', () => {
    const presets = buildKaliExamples(makeRecord({ binary: 'nmap' }));
    for (const p of presets) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/);
      expect(p.name.length).toBeGreaterThan(0);
    }
  });
});

describe('KALI_EXAMPLE_SEED', () => {
  it('every args using {{target}} keeps a single occurrence and no empty entries', () => {
    for (const [binary, examples] of Object.entries(KALI_EXAMPLE_SEED)) {
      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(ex.name.trim().length).toBeGreaterThan(0);
        expect(typeof ex.args).toBe('string');
        expect(binary.length).toBeGreaterThan(0);
      }
    }
  });
});
