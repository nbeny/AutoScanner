import { SnmpReconScanner } from '../snmp-recon.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';
const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };
describe('SnmpReconScanner', () => {
  it('declares name, docker image, TEXT output → snmp-text parser, produces Finding/OrgMetadata', () => {
    expect(SnmpReconScanner.name).toBe('snmp-recon');
    expect(SnmpReconScanner.docker.image).toBe('autoscanner/snmp-recon:1.0');
    expect(SnmpReconScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'snmp-text',
    });
    expect(SnmpReconScanner.produces).toEqual(expect.arrayContaining(['Finding', 'OrgMetadata']));
    expect(SnmpReconScanner.requiresCredential).toBeUndefined();
  });
  it('build() runs sh -lc with onesixtyone + snmpwalk using shell-quoted target', () => {
    const { cmd } = SnmpReconScanner.build(SnmpReconScanner.inputSchema.parse({}), '10.0.0.1', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('onesixtyone');
    expect(cmd[2]).toContain("'10.0.0.1'");
    expect(cmd[2]).toContain('snmpwalk');
  });
  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = SnmpReconScanner.build(
      SnmpReconScanner.inputSchema.parse({}),
      "10.0.0.1'; rm -rf /",
      ctx,
    );
    expect(cmd[2]).toContain("'10.0.0.1'\\''");
  });
});
