import { MasscanScanner } from './masscan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j1', engagementId: 'e1', scratchDir: '/tmp' };

describe('MasscanScanner', () => {
  it('declares identity, PORT_SCAN category, JSON/stdout output → masscan-json parser', () => {
    expect(MasscanScanner.name).toBe('masscan');
    expect(MasscanScanner.docker.image).toBe('autoscanner/masscan:1.0');
    expect(MasscanScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'masscan-json',
    });
    expect(MasscanScanner.produces).toContain('Port');
    expect(MasscanScanner.requiresCredential).toBeUndefined();
  });

  it('build() emits masscan cmd with default ports and rate', () => {
    const { cmd } = MasscanScanner.build(MasscanScanner.inputSchema.parse({}), '10.0.0.1', ctx);
    expect(cmd).toEqual(['masscan', '10.0.0.1', '-p', '1-65535', '--rate', '1000', '-oJ', '-']);
  });

  it('build() respects custom ports and rate', () => {
    const { cmd } = MasscanScanner.build(
      MasscanScanner.inputSchema.parse({ ports: '80,443', rate: 5000 }),
      '10.0.0.2',
      ctx,
    );
    expect(cmd).toContain('80,443');
    expect(cmd).toContain('5000');
  });
});
