import { UncoverJsonlParser } from '../uncover-jsonl.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'uncover',
  target: 'example.com',
  engagementId: 'e',
};

const SAMPLE = [
  '{"ip":"1.2.3.4","host":"a.example.com","port":22,"source":"shodan"}',
  '{"ip":"1.2.3.4","host":"a.example.com","port":443,"source":"censys"}',
  '{"ip":"5.6.7.8","port":80,"source":"fofa"}',
  'malformed',
].join('\n');

describe('UncoverJsonlParser', () => {
  it('emits IP assets with hostnames + source metadata, dedupes by ip', async () => {
    const out = await new UncoverJsonlParser().parse(SAMPLE, ctx);
    const ips = out.assets.map((a) => a.value).sort();
    expect(ips).toEqual(['1.2.3.4', '5.6.7.8']);
    expect(out.assets.every((a) => a.type === 'IP')).toBe(true);
    const first = out.assets.find((a) => a.value === '1.2.3.4');
    expect(first?.hostnames).toEqual(['a.example.com']);
  });

  it('returns empty output on blank input', async () => {
    const out = await new UncoverJsonlParser().parse('', ctx);
    expect(out.assets).toHaveLength(0);
  });
});
