import type { TemplateDefinition } from '../types';

/**
 * SMB / Windows playlist (SP3a) — SMB share + user/group enumeration against the
 * root target host. Active enumeration.
 */
export const SmbWindows: TemplateDefinition = {
  name: 'smb-windows',
  displayName: 'SMB / Windows',
  description:
    'Enumeration SMB/Windows: enum4linux (utilisateurs, partages, politique) et ' +
    'smbmap (listing des partages SMB).',
  scopeAcknowledgement:
    'Scan actif (SMB): assurez-vous que la cible est dans le perimetre avant de lancer.',
  steps: [{ scannerName: 'enum4linux' }, { scannerName: 'smbmap', args: '-H {{target}}' }],
};
