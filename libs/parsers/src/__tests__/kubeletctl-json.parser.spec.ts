import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KubeletctlJsonParser } from '../kubeletctl-json/kubeletctl-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'kubeletctl-sample.json'), 'utf8');
const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'kubeletctl',
  target: '10.0.0.5',
  engagementId: 'eng_1',
};

describe('KubeletctlJsonParser', () => {
  const parser = new KubeletctlJsonParser();

  it('declares name and formats', () => {
    expect(parser.name).toBe('kubeletctl-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('emits a HIGH finding listing pods when the kubelet answers anonymously', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.findings).toHaveLength(1);
    const f = out.findings[0];
    expect(f.severity).toBe('HIGH');
    expect(f.scannerName).toBe('kubeletctl');
    expect(f.title).toBe('Anonymous kubelet API access (pod listing)');
    expect(f.location).toBe('10.0.0.5');
    const ev = f.evidence as { podCount: number; pods: string[] };
    expect(ev.podCount).toBe(2);
    expect(ev.pods).toEqual(['default/nginx', 'prod/redis']);
  });

  it('returns empty output when there are no pods', async () => {
    const out = await parser.parse(JSON.stringify({ kind: 'PodList', items: [] }), ctx);
    expect(out.findings).toHaveLength(0);
  });

  it('returns empty output on malformed JSON', async () => {
    const out = await parser.parse('xxx', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
