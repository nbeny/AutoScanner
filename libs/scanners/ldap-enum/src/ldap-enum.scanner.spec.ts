import { LdapEnumScanner } from './ldap-enum.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp' };

describe('LdapEnumScanner', () => {
  it('declares identity, AD category and output parser', () => {
    expect(LdapEnumScanner.name).toBe('ldap-enum');
    expect(LdapEnumScanner.produces).toEqual(['Finding', 'OrgMetadata']);
    expect(LdapEnumScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'ldap-text',
    });
  });

  it('builds an anonymous RootDSE ldapsearch over the target', () => {
    const { cmd } = LdapEnumScanner.build({}, 'corp.local', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('ldapsearch -x');
    expect(cmd[2]).toContain('ldap://corp.local');
    expect(cmd[2]).toContain('-s base');
    expect(cmd[2]).toContain('namingContexts');
  });
});
