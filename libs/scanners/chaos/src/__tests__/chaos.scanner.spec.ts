import { ChaosScanner } from '../chaos.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('ChaosScanner', () => {
  it('declares name, image, JSONL stdout → chaos-json, produces Asset, requires CHAOS', () => {
    expect(ChaosScanner.name).toBe('chaos');
    expect(ChaosScanner.docker.image).toBe('autoscanner/chaos:1.0');
    expect(ChaosScanner.docker.readonlyRootfs).toBe(true);
    expect(ChaosScanner.requiresCredential).toBe('CHAOS');
    expect(ChaosScanner.credentialEnvVar).toBe('CHAOS_API_KEY');
    expect(ChaosScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'chaos-json',
    });
    expect(ChaosScanner.produces).toEqual(['Asset']);
  });

  it('build() runs chaos -d <domain> -silent -json with env-injected key', () => {
    const input = ChaosScanner.inputSchema.parse({});
    const { cmd } = ChaosScanner.build(input, 'example.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('chaos');
    expect(cmd[2]).toContain("-d 'example.com'");
    expect(cmd[2]).toContain('-silent');
    expect(cmd[2]).toContain('-json');
    // Key must come from env, never argv:
    expect(cmd[2]).not.toMatch(/CHAOS_API_KEY=[a-zA-Z]/);
  });

  it('shell-escapes targets with single quotes', () => {
    const input = ChaosScanner.inputSchema.parse({});
    const { cmd } = ChaosScanner.build(input, "a'.com", ctx);
    expect(cmd[2]).toContain("'a'\\''.com'");
  });
});
