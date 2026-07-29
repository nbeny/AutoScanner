import { LlmAttackJsonParser } from '../llm-attack-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'llm-attack',
  target: 'https://ai.example',
  engagementId: 'e',
};

describe('LlmAttackJsonParser', () => {
  const parser = new LlmAttackJsonParser();

  it('maps probe findings to NormalizedFindings at endpoint', async () => {
    const report = JSON.stringify({
      endpoint: 'https://ai.example/v1/chat/completions',
      findings: [
        {
          id: 'system-prompt-leak',
          severity: 'HIGH',
          title: 'System prompt / canary leaked',
          detail: 'canary echoed',
        },
      ],
    });
    const out = await parser.parse(report, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      scannerName: 'llm-attack',
      title: 'System prompt / canary leaked',
      severity: 'HIGH',
      location: 'https://ai.example/v1/chat/completions',
    });
  });

  it('returns empty output on empty / null / garbage', async () => {
    expect((await parser.parse('', ctx)).findings).toEqual([]);
    expect((await parser.parse('null', ctx)).findings).toEqual([]);
    expect((await parser.parse('nope', ctx)).findings).toEqual([]);
  });

  it('clamps unknown severity to INFO and falls back to ctx.target location', async () => {
    const out = await parser.parse(
      JSON.stringify({ findings: [{ title: 't', severity: 'X' }] }),
      ctx,
    );
    expect(out.findings[0].severity).toBe('INFO');
    expect(out.findings[0].location).toBe('https://ai.example');
  });
});
