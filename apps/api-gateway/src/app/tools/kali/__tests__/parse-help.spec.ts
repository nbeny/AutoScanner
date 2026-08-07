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
