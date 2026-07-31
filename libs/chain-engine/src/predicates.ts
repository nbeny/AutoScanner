import type { Predicate, Severity } from '@autoscanner/chains';
import type { WorldState, Candidate } from './world-state';
import type { PredicateEval } from './evaluation';

/** Version globale du catalogue de capacités (spec §7bis). */
export const CATALOG_VERSION = '1.0.0';

const SEVERITY_RANK: Record<Severity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

type GuardFn = (
  pred: Predicate,
  world: WorldState,
) => Omit<PredicateEval, 'pred' | 'version' | 'scope'>;
type FilterFn = (
  pred: Predicate,
  candidate: Candidate,
  world: WorldState,
) => Omit<PredicateEval, 'pred' | 'version' | 'scope'>;

interface PredicateDescriptor {
  version: string;
  guard?: GuardFn;
  filter?: FilterFn;
}

const HTTP_PORTS = new Set([80, 443, 8080, 8443]);

const CATALOG: Record<string, PredicateDescriptor> = {
  httpDetected: {
    version: '1.0.0',
    guard: (_p, w) => {
      const portHit = w.openPorts.some((p) => HTTP_PORTS.has(p.port));
      const svcHit = w.services.some((s) => (s.name ?? '').toLowerCase().includes('http'));
      const urlHit = w.urls.length > 0;
      const passed = portHit || svcHit || urlHit;
      return {
        expected: 'http surface (port 80/443, service http, or urls)',
        actual: { portHit, svcHit, urlCount: w.urls.length },
        passed,
      };
    },
  },
  hasOpenPort: {
    version: '1.0.0',
    guard: (p, w) => {
      const port = (p as { port: number }).port;
      const open = w.openPorts.map((x) => x.port);
      return {
        args: { port },
        expected: { openPort: port },
        actual: open,
        passed: open.includes(port),
      };
    },
  },
  techPresent: {
    version: '1.0.0',
    guard: (p, w) => {
      const name = (p as { name: string }).name.toLowerCase();
      const techs = w.technologies.map((t) => t.name);
      const passed = techs.some((t) => t.toLowerCase().includes(name));
      return { args: { name }, expected: { techContains: name }, actual: techs, passed };
    },
  },
  hasFindingSeverity: {
    version: '1.0.0',
    guard: (p, w) => {
      const atLeast = (p as { atLeast: Severity }).atLeast;
      const threshold = SEVERITY_RANK[atLeast];
      const maxRank = w.findings.reduce((m, f) => {
        const r = SEVERITY_RANK[f.severity.toUpperCase() as Severity] ?? 0;
        return r > m ? r : m;
      }, 0);
      return {
        args: { atLeast },
        expected: { severityAtLeast: atLeast },
        actual: maxRank,
        passed: maxRank >= threshold,
      };
    },
  },
  scannerRan: {
    version: '1.0.0',
    guard: (p, w) => {
      const name = (p as { name: string }).name;
      const passed = w.scannersRun.includes(name);
      return { args: { name }, expected: { scannerRan: name }, actual: w.scannersRun, passed };
    },
  },
  scannerNotRun: {
    version: '1.0.0',
    guard: (p, w) => {
      const name = (p as { name: string }).name;
      const passed = !w.scannersRun.includes(name);
      return { args: { name }, expected: { scannerNotRun: name }, actual: w.scannersRun, passed };
    },
  },
  notBehindCdn: {
    version: '1.0.0',
    filter: (_p, c) => {
      // fail-open : inconnu ⇒ garde la cible (spec §6).
      const behind = c.cdn?.behind === true;
      return { expected: { behindCdn: false }, actual: c.cdn ?? 'unknown', passed: !behind };
    },
  },
  behindCdn: {
    version: '1.0.0',
    filter: (_p, c) => {
      const behind = c.cdn?.behind === true;
      return { expected: { behindCdn: true }, actual: c.cdn ?? 'unknown', passed: behind };
    },
  },
  statusIn: {
    version: '1.0.0',
    filter: (p, c) => {
      const codes = (p as { codes: number[] }).codes;
      const status = c.httpStatus ?? c.statusCode ?? null;
      const passed = status !== null && codes.includes(status);
      return { args: { codes }, expected: { statusIn: codes }, actual: status, passed };
    },
  },
};

export function evalGuard(pred: Predicate, world: WorldState): PredicateEval {
  const desc = CATALOG[pred.pred];
  if (!desc?.guard) throw new Error(`Predicate "${pred.pred}" is not a guard`);
  const r = desc.guard(pred, world);
  return { pred: pred.pred, version: desc.version, scope: 'guard', ...r };
}

export function evalFilter(
  pred: Predicate,
  candidate: Candidate,
  world: WorldState,
): PredicateEval {
  const desc = CATALOG[pred.pred];
  if (!desc?.filter) throw new Error(`Predicate "${pred.pred}" is not a filter`);
  const r = desc.filter(pred, candidate, world);
  return { pred: pred.pred, version: desc.version, scope: 'filter', target: candidate.value, ...r };
}
