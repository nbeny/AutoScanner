import { IplinesTextParser } from '../iplines-text/iplines-text.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'mapcidr',
  target: '10.0.0.0/30',
  engagementId: 'e',
};

describe('IplinesTextParser', () => {
  const parser = new IplinesTextParser();

  it('declares name and TEXT format', () => {
    expect(parser.name).toBe('iplines-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('emits one IP asset per valid line, deduped, skipping blanks/comments/junk', async () => {
    const out = await parser.parse('10.0.0.1\n10.0.0.2\n10.0.0.1\n# note\n\nnot-an-ip\n', ctx);
    const ips = out.assets.filter((a) => a.type === 'IP').map((a) => a.value);
    expect(ips).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('accepts IPv6 addresses', async () => {
    const out = await parser.parse('2001:db8::1\n', ctx);
    expect(out.assets).toEqual([{ type: 'IP', value: '2001:db8::1' }]);
  });

  it('returns empty output on blank input', async () => {
    expect((await parser.parse('', ctx)).assets).toHaveLength(0);
  });
});
