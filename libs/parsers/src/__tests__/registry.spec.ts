import { ParserRegistry } from '../registry';
import type { Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const dummy: Parser = {
  name: 'dummy',
  formats: ['JSON'],
  async parse(_input: Buffer | string, _ctx: ParserContext) {
    return emptyNormalizedOutput();
  },
};

describe('ParserRegistry', () => {
  it('registers and retrieves a parser', () => {
    const reg = new ParserRegistry();
    reg.register(dummy);
    expect(reg.has('dummy')).toBe(true);
    expect(reg.get('dummy')).toBe(dummy);
  });

  it('throws on duplicate', () => {
    const reg = new ParserRegistry();
    reg.register(dummy);
    expect(() => reg.register(dummy)).toThrow(/already registered/);
  });

  it('throws on unknown name', () => {
    const reg = new ParserRegistry();
    expect(() => reg.get('ghost')).toThrow(/not found/);
  });
});
