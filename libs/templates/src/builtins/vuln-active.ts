import type { TemplateDefinition } from '../types';

/**
 * Phase 8.4 — active web-vulnerability template chaining the 3 injection
 * scanners against the target URL. Detection/PoC only (level=detect default).
 */
export const VulnActive: TemplateDefinition = {
  name: 'vuln-active',
  displayName: 'Active Web Vuln',
  description:
    'Active web-vulnerability scanning: reflected/DOM XSS (dalfox), SQL injection (sqlmap), ' +
    'and OS command injection (commix). Detection/PoC only by default. Maps results onto Finding entities. ' +
    'No API key required. Intrusive - engagement scope only.',
  steps: [
    { scannerName: 'xss-scan', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'sqli-scan', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'cmdi-scan', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
