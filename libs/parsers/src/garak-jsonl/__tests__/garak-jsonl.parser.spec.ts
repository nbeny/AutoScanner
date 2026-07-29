import { GarakJsonlParser } from '../garak-jsonl.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'garak',
  target: 'https://ai.example',
  engagementId: 'e',
};

describe('GarakJsonlParser', () => {
  const parser = new GarakJsonlParser();

  it('emits a finding per eval row with failures; HIGH when fully vulnerable', async () => {
    const jsonl = [
      JSON.stringify({ entry_type: 'eval', probe: 'dan.Dan_11_0', passed: 0, total: 5 }),
      JSON.stringify({
        entry_type: 'eval',
        probe: 'promptinject.HijackHateHumans',
        passed: 3,
        total: 5,
      }),
      JSON.stringify({
        entry_type: 'eval',
        probe: 'leakreplay.LiteratureCloze',
        passed: 5,
        total: 5,
      }),
    ].join('\n');
    const out = await parser.parse(jsonl, ctx);
    expect(out.findings).toHaveLength(2); // the fully-passed one is not a finding
    const dan = out.findings.find((f) => f.title.includes('dan.Dan_11_0'));
    expect(dan?.severity).toBe('HIGH');
    const pi = out.findings.find((f) => f.title.includes('promptinject'));
    expect(pi?.severity).toBe('MEDIUM');
    expect(dan?.location).toBe('https://ai.example');
  });

  it('skips non-eval and malformed lines; empty input → no findings', async () => {
    const jsonl = ['{"entry_type":"start_run"}', 'not json', ''].join('\n');
    expect((await parser.parse(jsonl, ctx)).findings).toEqual([]);
    expect((await parser.parse('', ctx)).findings).toEqual([]);
  });
});
