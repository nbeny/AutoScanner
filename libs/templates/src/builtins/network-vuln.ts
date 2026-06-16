import type { TemplateDefinition } from '../types';

/**
 * Phase 8.5 — active network vulnerability template. Runs the OpenVAS/openvasd
 * scanner against the target host. Requires the greenbone stack + OPENVAS credential.
 */
export const NetworkVuln: TemplateDefinition = {
  name: 'network-vuln',
  displayName: 'Network Vuln (OpenVAS)',
  description:
    'Active network/host vulnerability scanning via Greenbone openvasd: verified NVT checks, ' +
    'CVE-tagged Findings with CVSS-derived severity. Requires the greenbone stack and an OPENVAS ' +
    'API-key credential. Intrusive - engagement scope only.',
  steps: [{ scannerName: 'openvas-scan', inputs: {}, target: { kind: 'context', path: 'target' } }],
};
