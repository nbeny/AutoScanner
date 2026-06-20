import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KubeHunterJsonParser } from '../kube-hunter-json/kube-hunter-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'kube-hunter-sample.json'), 'utf8');
const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'kube-hunter',
  target: '10.0.0.5',
  engagementId: 'eng_1',
};

describe('KubeHunterJsonParser', () => {
  const parser = new KubeHunterJsonParser();

  it('declares name and formats', () => {
    expect(parser.name).toBe('kube-hunter-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('maps each vulnerability to a finding with mapped severity', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.findings).toHaveLength(2);
    const anon = out.findings.find((f) => f.title === 'Anonymous Authentication');
    expect(anon?.severity).toBe('HIGH');
    expect(anon?.scannerName).toBe('kube-hunter');
    expect(anon?.location).toBe('10.0.0.5:10250');
    expect((anon?.evidence as { vid: string }).vid).toBe('KHV005');
    const ver = out.findings.find((f) => f.title === 'K8s Version Disclosure');
    expect(ver?.severity).toBe('MEDIUM');
  });

  it('returns empty output on malformed JSON', async () => {
    const out = await parser.parse('nope', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
