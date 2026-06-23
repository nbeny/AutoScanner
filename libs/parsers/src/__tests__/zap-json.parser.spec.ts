import { ZapJsonParser } from '../zap-json/zap-json.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'zap-scan',
  target: 'https://t.example',
  engagementId: 'e',
};

describe('ZapJsonParser', () => {
  const p = new ZapJsonParser();

  it('maps a high-risk SQLi alert to a HIGH finding with class tag', async () => {
    const report = JSON.stringify({
      site: [
        {
          '@name': 'https://t.example',
          alerts: [
            {
              name: 'SQL Injection',
              riskcode: '3',
              desc: 'SQLi found',
              cweid: '89',
              pluginid: '40018',
              instances: [{ uri: 'https://t.example/?id=1', method: 'GET', param: 'id' }],
            },
          ],
        },
      ],
    });
    const out = await p.parse(report, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].scannerName).toBe('zap-scan');
    expect(out.findings[0].severity).toBe('HIGH');
    expect(out.findings[0].location).toBe('https://t.example/?id=1');
    expect((out.findings[0].evidence as { injectionClass?: string }).injectionClass).toBe('sqli');
  });

  it('maps riskcode 0/1/2 to INFO/LOW/MEDIUM', async () => {
    const mk = (code: string) =>
      JSON.stringify({ site: [{ alerts: [{ name: `a${code}`, riskcode: code }] }] });
    expect((await p.parse(mk('0'), ctx)).findings[0].severity).toBe('INFO');
    expect((await p.parse(mk('1'), ctx)).findings[0].severity).toBe('LOW');
    expect((await p.parse(mk('2'), ctx)).findings[0].severity).toBe('MEDIUM');
  });

  it('returns empty on blank / malformed input without throwing', async () => {
    expect((await p.parse('', ctx)).findings).toHaveLength(0);
    expect((await p.parse('{not json', ctx)).findings).toHaveLength(0);
    expect((await p.parse('{}', ctx)).findings).toHaveLength(0);
  });
});
