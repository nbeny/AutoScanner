import { LlmReconJsonParser } from '../llm-recon-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'llm-recon',
  target: 'https://ai.example',
  engagementId: 'e',
};

describe('LlmReconJsonParser', () => {
  const parser = new LlmReconJsonParser();

  it('maps probe findings to NormalizedFindings at baseUrl', async () => {
    const report = JSON.stringify({
      baseUrl: 'https://ai.example',
      findings: [
        { id: 'ollama-open', severity: 'HIGH', title: 'Exposed Ollama API', detail: 'no auth' },
      ],
    });
    const out = await parser.parse(report, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      scannerName: 'llm-recon',
      title: 'Exposed Ollama API',
      severity: 'HIGH',
      location: 'https://ai.example',
    });
  });

  it('returns empty output on empty / null / garbage', async () => {
    expect((await parser.parse('', ctx)).findings).toEqual([]);
    expect((await parser.parse('null', ctx)).findings).toEqual([]);
    expect((await parser.parse('nope', ctx)).findings).toEqual([]);
  });

  it('clamps unknown severity to INFO', async () => {
    const out = await parser.parse(
      JSON.stringify({ baseUrl: 'u', findings: [{ title: 't', severity: 'X' }] }),
      ctx,
    );
    expect(out.findings[0].severity).toBe('INFO');
  });
});
