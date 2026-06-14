import type { TemplateDefinition } from '../types';

/**
 * Phase 8.3 — service/protocol reconnaissance template chaining all 4 new
 * service-probing scanners against the initial target.
 *
 * Steps:
 *   - smtp-recon    : SMTP capability, open-relay, user enum (nmap NSE) → Finding + OrgMetadata
 *   - snmp-recon    : SNMP community scan + sysDescr walk → Finding + OrgMetadata
 *   - smb-enum      : Anonymous SMB/Windows enum (enum4linux-ng) → Finding + OrgMetadata
 *   - api-discovery : Hidden API route brute-force (kiterunner) → Endpoint
 */
export const ServiceRecon: TemplateDefinition = {
  name: 'service-recon',
  displayName: 'Service Recon',
  description:
    'Active service/protocol reconnaissance: SMTP capability & open-relay detection (nmap NSE), ' +
    'SNMP community enumeration (onesixtyone + snmpwalk), anonymous SMB/Windows enumeration ' +
    '(enum4linux-ng), and hidden API route discovery (kiterunner). ' +
    'Maps results onto Finding, OrgMetadata, and Endpoint entities. No API key required.',
  steps: [
    { scannerName: 'smtp-recon', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'snmp-recon', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'smb-enum', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'api-discovery', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
