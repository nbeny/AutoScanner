import { Enum4LinuxNgScanner } from '../enum4linux-ng.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('Enum4LinuxNgScanner', () => {
  it('pinned image, bridge, no caps, readonlyRootfs', () => {
    expect(Enum4LinuxNgScanner.name).toBe('enum4linux-ng');
    expect(Enum4LinuxNgScanner.docker.image).toBe('autoscanner/enum4linux-ng:1.0');
    expect(Enum4LinuxNgScanner.docker.network).toBe('bridge');
    expect(Enum4LinuxNgScanner.docker.capabilities).toEqual([]);
    expect(Enum4LinuxNgScanner.docker.readonlyRootfs).toBe(true);
  });

  it('build() with no creds runs anonymous -A -oJ', () => {
    const input = Enum4LinuxNgScanner.inputSchema.parse({});
    const { cmd, env } = Enum4LinuxNgScanner.build(input, '10.0.0.5', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('enum4linux-ng');
    expect(cmd[2]).toContain('-A');
    expect(cmd[2]).toContain('-oJ /out/result.json');
    expect(cmd[2]).toContain('10.0.0.5');
    expect(cmd[2]).not.toContain('-u');
    expect(env ?? {}).toEqual({});
  });

  it('build() with creds passes -u/-p via env-substituted argv, not host argv', () => {
    const input = Enum4LinuxNgScanner.inputSchema.parse({
      username: 'alice',
      password: 's3cret',
    });
    const { cmd, env } = Enum4LinuxNgScanner.build(input, '10.0.0.5', ctx);
    // CRITICAL: literal credentials must NOT appear in cmd.
    expect(JSON.stringify(cmd)).not.toContain('alice');
    expect(JSON.stringify(cmd)).not.toContain('s3cret');
    expect(cmd[2]).toContain('-u "$ENUM4_USER"');
    expect(cmd[2]).toContain('-p "$ENUM4_PASS"');
    expect(env).toEqual({ ENUM4_USER: 'alice', ENUM4_PASS: 's3cret' });
  });

  it('declares JSON @ /out/result.json → enum4linux-json, produces Identity+Asset+Finding', () => {
    expect(Enum4LinuxNgScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/out/result.json' },
      parser: 'enum4linux-json',
    });
    expect(Enum4LinuxNgScanner.produces).toEqual(['Identity', 'Asset', 'Finding']);
  });
});
