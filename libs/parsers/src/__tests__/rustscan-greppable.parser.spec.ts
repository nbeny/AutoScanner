import { RustscanGreppableParser } from '../rustscan-greppable/rustscan-greppable.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'rustscan',
  target: '10.0.0.1',
  engagementId: 'e',
};

describe('RustscanGreppableParser', () => {
  const parser = new RustscanGreppableParser();

  it('parses canonical greppable format "<ip> -> [p1,p2,p3]"', async () => {
    const text = '10.0.0.1 -> [22,80,443]\n';
    const out = await parser.parse(text, ctx);
    expect(out.assets).toEqual([{ type: 'IP', value: '10.0.0.1' }]);
    expect(out.ports).toEqual([
      { assetValue: '10.0.0.1', number: 22, protocol: 'TCP', state: 'OPEN' },
      { assetValue: '10.0.0.1', number: 80, protocol: 'TCP', state: 'OPEN' },
      { assetValue: '10.0.0.1', number: 443, protocol: 'TCP', state: 'OPEN' },
    ]);
  });

  it('ignores banner/progress lines', async () => {
    const text = ['Open 10.0.0.1:22', '[~] Starting Script(s)', '10.0.0.1 -> [22]'].join('\n');
    const out = await parser.parse(text, ctx);
    expect(out.ports).toHaveLength(1);
  });

  it('returns empty on blank input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.assets).toHaveLength(0);
    expect(out.ports).toHaveLength(0);
  });

  it('handles multiple IPs', async () => {
    const text = '10.0.0.1 -> [22]\n10.0.0.2 -> [80,443]\n';
    const out = await parser.parse(text, ctx);
    expect(out.assets).toHaveLength(2);
    expect(out.ports).toHaveLength(3);
  });
});
