import type { TemplateDefinition } from '../types';

export const ActiveDirectoryRecon: TemplateDefinition = {
  name: 'active-directory-recon',
  displayName: 'Active Directory Recon',
  description:
    'Unauthenticated AD/Kerberos recon: Kerberos user enumeration + AS-REP roasting (kerbrute) ' +
    'and anonymous LDAP RootDSE enumeration (ldap-enum). No credentials required. ' +
    'Set the engagement target to the AD domain (e.g. corp.local).',
  steps: [
    { scannerName: 'kerbrute', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'ldap-enum', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
