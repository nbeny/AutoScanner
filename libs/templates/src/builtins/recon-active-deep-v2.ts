import type { TemplateDefinition } from '../types';

/**
 * Active reconnaissance deep chain (Phase 13B). Combines a fast nmap
 * top-1000 sweep with a full-range rustscan, then layers DNS/SNMP/SMB
 * enumeration. The ike-scan step is gated by the `active-recon-host-net`
 * capability and is silently skipped when the operator lacks it.
 */
export const ReconActiveDeepV2: TemplateDefinition = {
  name: 'recon-active-deep-v2',
  displayName: 'Active Recon Deep v2',
  description:
    'Deep active recon: nmap → rustscan → dnsrecon → snmp-recon → onesixtyone → ' +
    'smb-enum → enum4linux-ng → ike-scan (host-network, gated).',
  scopeAcknowledgement:
    'Active scan: ensure targets are within engagement scope before scheduling.',
  steps: [
    {
      scannerName: 'nmap',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    },
    {
      scannerName: 'rustscan',
      inputs: {},
      target: { kind: 'context', path: 'ipAddresses' },
    },
    {
      scannerName: 'dnsrecon',
      inputs: {
        methods: { kind: 'static', value: ['std', 'axfr', 'srv'] },
      },
      target: { kind: 'context', path: 'target' },
    },
    {
      scannerName: 'snmp-recon',
      inputs: {},
      target: { kind: 'context', path: 'ipAddresses' },
    },
    {
      scannerName: 'onesixtyone',
      inputs: {},
      target: { kind: 'context', path: 'ipAddresses' },
    },
    {
      scannerName: 'smb-enum',
      inputs: {},
      target: { kind: 'context', path: 'ipAddresses' },
    },
    {
      scannerName: 'enum4linux-ng',
      inputs: {},
      target: { kind: 'context', path: 'ipAddresses' },
    },
    {
      scannerName: 'ike-scan',
      inputs: {},
      target: { kind: 'context', path: 'ipAddresses' },
      requiresCapability: 'active-recon-host-net',
    },
  ],
};
