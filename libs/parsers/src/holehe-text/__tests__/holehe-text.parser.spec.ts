import { HoleheTextParser } from '../holehe-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'holehe',
  target: 'a@b.com',
  engagementId: 'e',
};

const SAMPLE = [
  '## SEED a@b.com',
  '[+] github.com',
  '[+] twitter.com',
  '[-] instagram.com',
  '## SEED c@d.io',
  '[+] spotify.com',
].join('\n');

describe('HoleheTextParser', () => {
  it('maps only [+] lines to EMAIL_ACCOUNT identities tied to the current SEED', async () => {
    const out = await new HoleheTextParser().parse(SAMPLE, ctx);
    expect(out.identities).toHaveLength(3);
    expect(out.identities[0]).toEqual({
      kind: 'EMAIL_ACCOUNT',
      seed: 'a@b.com',
      service: 'github.com',
      source: 'holehe',
    });
    expect(out.identities[2]).toMatchObject({ seed: 'c@d.io', service: 'spotify.com' });
  });

  it('ignores [-] and rate-limited [x] lines', async () => {
    const out = await new HoleheTextParser().parse('## SEED a@b.com\n[-] x.com\n[x] y.com', ctx);
    expect(out.identities).toHaveLength(0);
  });

  it('ignores the "[+] Email used" legend line (non-domain token)', async () => {
    const out = await new HoleheTextParser().parse(
      '## SEED a@b.com\n[+] Email used\n[+] github.com',
      ctx,
    );
    expect(out.identities).toHaveLength(1);
    expect(out.identities[0]).toMatchObject({ service: 'github.com' });
  });
});
