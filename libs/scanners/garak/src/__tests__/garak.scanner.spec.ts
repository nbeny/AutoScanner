import { GarakScanner } from '../garak.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('GarakScanner', () => {
  it('declares name, image, JSON file → garak-jsonl, produces Finding, ai-llm category', () => {
    expect(GarakScanner.name).toBe('garak');
    expect(GarakScanner.docker.image).toBe('autoscanner/garak:1.0');
    expect(GarakScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: { path: '/out/garak.report.jsonl' },
      parser: 'garak-jsonl',
    });
    expect(GarakScanner.produces).toEqual(['Finding']);
    expect(GarakScanner.category).toContain('ai-llm');
  });

  it('build() runs garak with the openai generator, endpoint, model and default probes', () => {
    const input = GarakScanner.inputSchema.parse({});
    const { cmd } = GarakScanner.build(input, 'https://ai.example', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('garak');
    expect(cmd[2]).toContain("'https://ai.example'");
    expect(cmd[2]).toContain('gpt-3.5-turbo');
    expect(cmd[2]).toContain('promptinject,dan,leakreplay');
    expect(cmd[2]).toContain('/out/garak.report.jsonl');
  });

  it('honours custom model + probes and rejects an empty probe entry', () => {
    const input = GarakScanner.inputSchema.parse({ model: 'llama3', probes: ['dan'] });
    const { cmd } = GarakScanner.build(input, 'https://ai.example', ctx);
    expect(cmd[2]).toContain('llama3');
    expect(cmd[2]).toContain('dan');
    expect(() => GarakScanner.inputSchema.parse({ probes: [''] })).toThrow();
  });
});
