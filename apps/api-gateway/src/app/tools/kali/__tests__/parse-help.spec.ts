import { parseHelpOptions } from '../parse-help';

describe('parseHelpOptions', () => {
  it('returns none for empty help', () => {
    expect(parseHelpOptions('')).toEqual({ options: [], confidence: 'none' });
    expect(parseHelpOptions('   \n  ')).toEqual({ options: [], confidence: 'none' });
  });

  it('parses getopt-style options (flag, argHint, description)', () => {
    const help = [
      'Options:',
      '  -h, --help            Show help',
      '  -p <ports>            Only scan these ports',
      '  -sV                   Probe service/version',
    ].join('\n');
    expect(parseHelpOptions(help)).toEqual({
      confidence: 'high',
      options: [
        { flag: '-h', argHint: null, description: 'Show help' },
        { flag: '-p', argHint: '<ports>', description: 'Only scan these ports' },
        { flag: '-sV', argHint: null, description: 'Probe service/version' },
      ],
    });
  });

  it('parses argparse-style ALLCAPS arg hints and long flags', () => {
    const help = [
      'optional arguments:',
      '  -u URL, --url URL     Target URL',
      '  --threads N           Number of threads',
    ].join('\n');
    expect(parseHelpOptions(help)).toEqual({
      confidence: 'low',
      options: [
        { flag: '-u', argHint: 'URL', description: 'Target URL' },
        { flag: '--threads', argHint: null, description: 'Number of threads' },
      ],
    });
  });

  it('picks up a description from the next indented continuation line', () => {
    const help = ['  --rate\n              Requests per second'].join('\n');
    expect(parseHelpOptions(help)).toEqual({
      confidence: 'low',
      options: [{ flag: '--rate', argHint: null, description: 'Requests per second' }],
    });
  });
});

describe('parse-help — flags collés à la marge (indent 0)', () => {
  it('parse un help style john (flush-left, arg collé)', () => {
    const help = [
      'John the Ripper password cracker',
      '',
      '--single[=SECTION[,..]]   "single crack" mode, using default or named rules',
      '--wordlist[=FILE]         wordlist mode, read words from FILE',
      '--rules=NAME              enable word mangling rules named NAME',
    ].join('\n');
    const { options, confidence } = parseHelpOptions(help);
    const flags = options.map((o) => o.flag);
    expect(flags).toEqual(['--single', '--wordlist', '--rules']);
    expect(confidence).toBe('high');
    expect(options[2].argHint).toBe('NAME');
    expect(options[0].description).toContain('single crack');
  });

  it('ne matche pas une ligne de prose commençant par un tiret sans description', () => {
    const help = '-based tooling notes here without option layout\n';
    expect(parseHelpOptions(help).options).toHaveLength(0);
  });

  it('conserve le comportement indenté existant', () => {
    const help =
      '  -sV                 Probe open ports\n  --rate <number>     Send packets no faster than <number>';
    const o = parseHelpOptions(help).options;
    expect(o.map((x) => x.flag)).toEqual(['-sV', '--rate']);
    expect(o[1].argHint).toBe('<number>');
  });
});
