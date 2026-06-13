import { AmassScanner } from '../amass.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp/scratch' };

describe('AmassScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(AmassScanner.name).toBe('amass');
    expect(AmassScanner.displayName).toBe('Amass (passive)');
    expect(AmassScanner.docker.image).toBe('caffix/amass:v4.2.0');
    expect(AmassScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'hostlines-text',
    });
    expect(AmassScanner.produces).toContain('Subdomain');
  });

  it('inputSchema applies the default timeout (minutes)', () => {
    expect(AmassScanner.inputSchema.parse({})).toEqual({ timeoutMinutes: 5 });
  });

  it('build() runs amass enum in passive mode with -timeout in minutes', () => {
    const input = AmassScanner.inputSchema.parse({});
    const { cmd } = AmassScanner.build(input, 'example.com', ctx);
    expect(cmd).toEqual([
      'amass',
      'enum',
      '-passive',
      '-d',
      'example.com',
      '-nocolor',
      '-timeout',
      '5',
    ]);
  });

  it('rejects out-of-range timeout', () => {
    expect(() => AmassScanner.inputSchema.parse({ timeoutMinutes: 0 })).toThrow();
    expect(() => AmassScanner.inputSchema.parse({ timeoutMinutes: 61 })).toThrow();
  });
});
