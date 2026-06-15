import { DalfoxJsonParser } from '../dalfox-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'xss-scan',
  target: 'https://x.test',
  engagementId: 'e',
};

describe('DalfoxJsonParser', () => {
  const parser = new DalfoxJsonParser();

  it('emits a HIGH Finding per confirmed XSS PoC (deduped by data)', async () => {
    const json = JSON.stringify([
      {
        type: 'V',
        severity: 'High',
        cwe: 'CWE-79',
        data: 'https://x.test/?q=<script>',
        message_str: 'reflected',
        param: 'q',
      },
      {
        type: 'V',
        severity: 'High',
        cwe: 'CWE-79',
        data: 'https://x.test/?q=<script>',
        message_str: 'reflected',
        param: 'q',
      },
      { type: 'G', severity: 'Medium', data: 'https://x.test/?q=grep', message_str: 'grep' },
    ]);
    const out = await parser.parse(json, ctx);
    const xss = out.findings.filter((f) => f.title.toLowerCase().includes('xss'));
    expect(xss).toHaveLength(1);
    expect(xss[0].severity).toBe('HIGH');
    expect(xss[0].location).toBe('https://x.test/?q=<script>');
  });

  it('tolerant of blank/garbage/JSONL', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
    expect((await parser.parse('not json', ctx)).findings).toHaveLength(0);
    const jsonl = '{"type":"V","severity":"High","data":"https://x.test/?a=1","param":"a"}';
    expect((await parser.parse(jsonl, ctx)).findings).toHaveLength(1);
  });
});
