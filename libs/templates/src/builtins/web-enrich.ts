import type { TemplateDefinition } from '../types';

/**
 * Phase 8.2 — active-but-light web enrichment template chaining all 4 new
 * enrichment scanners against the initial target.
 *
 * Steps:
 *   - favicon   : mmh3 favicon hash (httpx -favicon) → Technology
 *   - wafw00f   : WAF detection → Technology
 *   - cdncheck  : CDN/cloud/WAF host check → Technology
 *   - js-recon  : JS endpoint extraction + secret scanning → Endpoint + Finding
 */
export const WebEnrich: TemplateDefinition = {
  name: 'web-enrich',
  displayName: 'Web Enrich',
  description:
    'Active-but-light enrichment: favicon hash (httpx), WAF detection (wafw00f), ' +
    'CDN/cloud identification (cdncheck), JS endpoint & secret extraction (js-recon). ' +
    'Maps results onto Technology, Endpoint, and Finding entities. No API key required.',
  steps: [
    { scannerName: 'favicon', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'wafw00f', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'cdncheck', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'js-recon', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
