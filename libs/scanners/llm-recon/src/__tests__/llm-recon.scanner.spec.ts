import { LlmReconScanner } from '../llm-recon.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('LlmReconScanner', () => {
  it('declares name, image, JSON file → llm-recon-json, produces Finding', () => {
    expect(LlmReconScanner.name).toBe('llm-recon');
    expect(LlmReconScanner.docker.image).toBe('autoscanner/llm-recon:1.0');
    expect(LlmReconScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/out/result.json' },
      parser: 'llm-recon-json',
    });
    expect(LlmReconScanner.produces).toEqual(['Finding']);
  });

  it('categorised as ai-llm + web-fingerprint', () => {
    expect(LlmReconScanner.category).toContain('ai-llm');
    expect(LlmReconScanner.category).toContain('web-fingerprint');
  });

  it('build() runs llm-recon-probe against the target', () => {
    const input = LlmReconScanner.inputSchema.parse({});
    const { cmd } = LlmReconScanner.build(input, 'https://ai.example', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('llm-recon-probe');
    expect(cmd[2]).toContain("'https://ai.example'");
    expect(cmd[2]).toContain('/out/result.json');
  });

  it('prefers explicit baseUrl over target and rejects non-URLs', () => {
    const input = LlmReconScanner.inputSchema.parse({ baseUrl: 'https://x.example:11434' });
    const { cmd } = LlmReconScanner.build(input, 'https://ignored', ctx);
    expect(cmd[2]).toContain("'https://x.example:11434'");
    expect(() => LlmReconScanner.inputSchema.parse({ baseUrl: 'nope' })).toThrow();
  });
});
