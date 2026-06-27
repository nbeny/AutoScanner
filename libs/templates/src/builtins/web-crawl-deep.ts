import type { TemplateDefinition } from '../types';

/**
 * Phase 13C — Deep web crawling + light vuln-recon.
 *
 * Chain: httpx → katana → gospider → hakrawler → feroxbuster → cariddi → corsy.
 *
 * Fan-in: all four crawler steps (katana, gospider, hakrawler, feroxbuster)
 * target the engagement root and emit Endpoint entities. The parser-worker
 * persists them to the Endpoint table; the orchestrator's ContextBuilder
 * resolves `path: 'endpoints'` to the deduplicated union of canonicalUrl rows
 * (see context-builder.service.ts → case 'endpoints'). Cariddi and corsy
 * therefore receive the merged URL set with no extra wiring.
 *
 * Engagement-scope gate: the template engine filters out-of-scope URLs at
 * Endpoint-persist time (parser-worker scope check) so out-of-scope URLs
 * emitted by any crawler never reach cariddi/corsy.
 *
 * WAF/rate-limit warning banner is surfaced by the UI when this template
 * is selected (frontend handles the badge via TemplateDefinition.name).
 */
export const WebCrawlDeep: TemplateDefinition = {
  name: 'web-crawl-deep',
  displayName: 'Web Crawl Deep',
  description:
    'Deep web recon: httpx probe → katana/gospider/hakrawler/feroxbuster crawl (fanned-in) → ' +
    'cariddi secret hunt + corsy CORS misconfig scan. WAF + rate-limit caution applies.',
  steps: [
    {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    },
    { scannerName: 'katana', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'gospider', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'hakrawler', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'feroxbuster', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'cariddi', inputs: {}, target: { kind: 'context', path: 'endpoints' } },
    { scannerName: 'corsy', inputs: {}, target: { kind: 'context', path: 'endpoints' } },
  ],
};
