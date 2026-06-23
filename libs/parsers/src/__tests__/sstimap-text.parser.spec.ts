import { SstimapTextParser } from '../sstimap-text/sstimap-text.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'ssti-scan',
  target: 'https://t.example/?name=x',
  engagementId: 'e',
};

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

  it('returns empty when no injection point is reported', async () => {
    expect(
      (await p.parse('[-] SSTImap could not detect a template injection', ctx)).findings,
    ).toHaveLength(0);
    expect((await p.parse('', ctx)).findings).toHaveLength(0);
  });
});
