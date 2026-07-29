import { ExposedConfigScanner } from '../exposed-config.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('ExposedConfigScanner', () => {
  it('declares name, reuses nuclei image, JSONL stdout → nuclei-json, produces Finding', () => {
    expect(ExposedConfigScanner.name).toBe('exposed-config');
    expect(ExposedConfigScanner.docker.image).toBe('projectdiscovery/nuclei:v3.9.0');
    expect(ExposedConfigScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'nuclei-json',
    });
    expect(ExposedConfigScanner.produces).toEqual(['Finding']);
  });

  it('build() runs nuclei with the default exposure tag set and target on stdin', () => {
    const input = ExposedConfigScanner.inputSchema.parse({});
    const { cmd, stdin } = ExposedConfigScanner.build(input, 'https://app.example', ctx);
    expect(cmd[0]).toBe('nuclei');
    expect(cmd).toContain('-jsonl');
    expect(cmd).toContain('-tags');
    const tagsIdx = cmd.indexOf('-tags');
    expect(cmd[tagsIdx + 1]).toBe('exposure,config,backup,files');
    expect(stdin).toBe('https://app.example');
  });

  it('build() honours a custom tag list', () => {
    const input = ExposedConfigScanner.inputSchema.parse({ tags: ['exposure', 'logs'] });
    const { cmd } = ExposedConfigScanner.build(input, 'https://app.example', ctx);
    const tagsIdx = cmd.indexOf('-tags');
    expect(cmd[tagsIdx + 1]).toBe('exposure,logs');
  });

  it('rejects an empty tag string', () => {
    expect(() => ExposedConfigScanner.inputSchema.parse({ tags: [''] })).toThrow();
  });
});
