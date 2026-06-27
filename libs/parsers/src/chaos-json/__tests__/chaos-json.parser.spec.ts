import { ChaosJsonParser } from '../chaos-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'chaos',
  target: 'example.com',
  engagementId: 'e',
};

const SAMPLE = [
  '{"domain":"example.com","subdomain":"api"}',
  '{"domain":"example.com","subdomain":"blog"}',
  '{"domain":"example.com","subdomain":"api"}', // duplicate
  '',
  '{"not_a_chaos_row":true}',
].join('\n');

describe('ChaosJsonParser', () => {
  it('emits SUBDOMAIN assets for each unique <subdomain>.<domain> JSONL row', async () => {
    const out = await new ChaosJsonParser().parse(SAMPLE, ctx);
    const values = out.assets.map((a) => a.value).sort();
    expect(values).toEqual(['api.example.com', 'blog.example.com']);
    expect(out.assets.every((a) => a.type === 'SUBDOMAIN')).toBe(true);
  });

  it('returns empty output on empty input', async () => {
    const out = await new ChaosJsonParser().parse('', ctx);
    expect(out.assets).toHaveLength(0);
  });

  it('skips malformed JSON lines without throwing', async () => {
    const out = await new ChaosJsonParser().parse(
      'not-json\n{"domain":"x.com","subdomain":"a"}',
      ctx,
    );
    expect(out.assets).toEqual([{ type: 'SUBDOMAIN', value: 'a.x.com' }]);
  });
});
