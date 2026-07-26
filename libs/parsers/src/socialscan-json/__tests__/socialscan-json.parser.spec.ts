import { SocialscanJsonParser } from '../socialscan-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'socialscan',
  target: 'jdoe',
  engagementId: 'e',
};

describe('SocialscanJsonParser', () => {
  it('emits an identity only for taken (valid && !available) handles', async () => {
    const sample = JSON.stringify([
      {
        query: 'jdoe',
        platform: 'GitHub',
        available: false,
        valid: true,
        link: 'https://github.com/jdoe',
      },
      { query: 'jdoe', platform: 'Twitter', available: true, valid: true },
      { query: 'jane@example.com', platform: 'Instagram', available: false, valid: true },
    ]);
    const out = await new SocialscanJsonParser().parse(sample, ctx);
    expect(out.identities).toHaveLength(2);
    expect(out.identities[0]).toMatchObject({
      kind: 'USERNAME',
      seed: 'jdoe',
      service: 'GitHub',
      url: 'https://github.com/jdoe',
    });
    expect(out.identities[1]).toMatchObject({ kind: 'EMAIL_ACCOUNT', seed: 'jane@example.com' });
  });

  it('tolerates malformed JSON', async () => {
    const out = await new SocialscanJsonParser().parse('not json', ctx);
    expect(out.identities).toHaveLength(0);
  });
});
