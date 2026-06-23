import { MaigretTextParser } from '../maigret-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'maigret',
  target: 'jdoe',
  engagementId: 'e',
};

const SAMPLE = [
  '## SEED jdoe',
  '[+] GitHub: https://github.com/jdoe',
  '[+] Twitter: https://twitter.com/jdoe',
  '## SEED alice',
  '[+] Reddit: https://reddit.com/user/alice',
].join('\n');

describe('MaigretTextParser', () => {
  it('maps each [+] line to a USERNAME identity tied to the current SEED', async () => {
    const out = await new MaigretTextParser().parse(SAMPLE, ctx);
    expect(out.identities).toHaveLength(3);
    expect(out.identities[0]).toEqual({
      kind: 'USERNAME',
      seed: 'jdoe',
      service: 'GitHub',
      url: 'https://github.com/jdoe',
      source: 'maigret',
    });
    expect(out.identities[2]).toMatchObject({ seed: 'alice', service: 'Reddit' });
  });

  it('returns empty output for blank input', async () => {
    const out = await new MaigretTextParser().parse('', ctx);
    expect(out.identities).toHaveLength(0);
  });
});
