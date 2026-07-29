import { LlmAttackScanner } from '../llm-attack.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('LlmAttackScanner', () => {
  it('declares name, image, JSON file → llm-attack-json, produces Finding', () => {
    expect(LlmAttackScanner.name).toBe('llm-attack');
    expect(LlmAttackScanner.docker.image).toBe('autoscanner/llm-attack:1.0');
    expect(LlmAttackScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/out/result.json' },
      parser: 'llm-attack-json',
    });
    expect(LlmAttackScanner.produces).toEqual(['Finding']);
    expect(LlmAttackScanner.category).toContain('ai-llm');
    expect(LlmAttackScanner.category).toContain('vuln-scan');
  });

  it('build() defaults endpoint to <target>/v1/chat/completions and passes model + canary', () => {
    const input = LlmAttackScanner.inputSchema.parse({});
    const { cmd } = LlmAttackScanner.build(input, 'https://ai.example', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('llm-attack-probe');
    expect(cmd[2]).toContain("'https://ai.example/v1/chat/completions'");
    expect(cmd[2]).toContain("'gpt-3.5-turbo'");
    expect(cmd[2]).toContain('/out/result.json');
  });

  it('honours an explicit endpoint + model', () => {
    const input = LlmAttackScanner.inputSchema.parse({
      endpoint: 'https://api.example/v1/chat/completions',
      model: 'llama3',
    });
    const { cmd } = LlmAttackScanner.build(input, 'https://ignored', ctx);
    expect(cmd[2]).toContain("'https://api.example/v1/chat/completions'");
    expect(cmd[2]).toContain("'llama3'");
    expect(cmd[2]).not.toContain('ignored');
  });

  it('rejects a non-URL endpoint', () => {
    expect(() => LlmAttackScanner.inputSchema.parse({ endpoint: 'nope' })).toThrow();
  });
});
