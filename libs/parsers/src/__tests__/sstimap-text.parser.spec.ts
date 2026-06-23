import { SstimapTextParser } from '../sstimap-text/sstimap-text.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'ssti-scan',
  target: 'https://t.example/?name=x',
  engagementId: 'e',
};

const ESC = String.fromCharCode(27); // ANSI escape, as SSTImap emits

const SAMPLE = [
  '[+] SSTImap identified the following injection point:',
  '    Query parameter: name',
  '    Engine: Jinja2',
  '    Capabilities:',
  '      Code evaluation: ok, python code',
].join('\n');

describe('SstimapTextParser', () => {
  const p = new SstimapTextParser();

  it('emits a CRITICAL finding when code evaluation is possible', async () => {
    const out = await p.parse(SAMPLE, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].scannerName).toBe('ssti-scan');
    expect(out.findings[0].severity).toBe('CRITICAL');
    expect(out.findings[0].title).toContain('Jinja2');
  });

  it('emits HIGH when injection found but no code-eval line', async () => {
    const out = await p.parse(
      '[+] SSTImap identified the following injection point:\n    Engine: Twig',
      ctx,
    );
    expect(out.findings[0].severity).toBe('HIGH');
  });

  it('strips ANSI color codes from real SSTImap output → CRITICAL', async () => {
    const ansi = [
      `${ESC}[92m[+]${ESC}[0m SSTImap identified the following injection point:`,
      '    Engine: Jinja2',
      `    Code evaluation: ${ESC}[92mok${ESC}[0m, Python code`,
    ].join('\n');
    const out = await p.parse(ansi, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].severity).toBe('CRITICAL');
    expect(out.findings[0].title).toContain('Jinja2');
  });

  it('returns empty when no injection point is reported', async () => {
    expect(
      (await p.parse('[-] SSTImap could not detect a template injection', ctx)).findings,
    ).toHaveLength(0);
    expect((await p.parse('', ctx)).findings).toHaveLength(0);
  });
});
