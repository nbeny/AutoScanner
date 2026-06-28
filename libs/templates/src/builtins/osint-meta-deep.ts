import type { TemplateDefinition } from '../types';

/**
 * Phase 13A — OSINT meta-search & leak intel template. Sequences the 5 new
 * passive scanners after a crtsh+subfinder seed pass. gitleaks is opt-in:
 * the step only does useful work when the engagement scope includes one or
 * more GitHub orgs / repos (the scanner refuses the run otherwise).
 * Phase 14B — adds emailrep reputation check on the harvested email set.
 */
export const OsintMetaDeep: TemplateDefinition = {
  name: 'osint-meta-deep',
  displayName: 'OSINT Meta-search (deep)',
  description:
    'Cross-provider OSINT chain: crtsh + subfinder (seed) → chaos → uncover (shodan, censys, fofa) ' +
    '→ fofa → urlfinder → optional gitleaks. Zero-contact with the target; every step queries ' +
    'third-party data sources only. Reuses operator API credentials when present.',
  steps: [
    { scannerName: 'crtsh', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'subfinder', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'chaos', inputs: {}, target: { kind: 'context', path: 'target' } },
    {
      scannerName: 'uncover',
      inputs: {
        query: { kind: 'context', path: 'target' },
        engines: { kind: 'static', value: ['shodan', 'censys', 'fofa'] },
        limit: { kind: 'static', value: 200 },
      },
      target: { kind: 'context', path: 'target' },
    },
    {
      scannerName: 'fofa',
      inputs: { query: { kind: 'context', path: 'target' } },
      target: { kind: 'context', path: 'target' },
    },
    { scannerName: 'urlfinder', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'gitleaks', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'emailrep', inputs: {}, target: { kind: 'context', path: 'emails' } },
  ],
};
