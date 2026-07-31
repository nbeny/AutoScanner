import type { ContextPath, Predicate } from '@autoscanner/chains';
import type { WorldState, ResolvableEntities, Candidate } from './world-state';
import type { PredicateEval } from './evaluation';
import { evalFilter } from './predicates';

/** Résout un `from` en liste de cibles candidates, triée canoniquement par `value`. */
export function resolveCandidates(
  from: ContextPath,
  entities: ResolvableEntities,
  world: WorldState,
): Candidate[] {
  let out: Candidate[];
  switch (from) {
    case 'target':
      out = [{ value: world.target }];
      break;
    case 'subdomains':
      out = entities.subdomains.map((s) => ({ value: s.canonicalValue, httpStatus: s.httpStatus }));
      break;
    case 'ipAddresses':
      out = entities.ipAddresses.map((i) => ({ value: i.value, cdn: i.cdn }));
      break;
    case 'urls':
      out = entities.urls.map((u) => ({ value: u.canonicalUrl, statusCode: u.statusCode }));
      break;
    case 'endpoints':
      out = entities.endpoints.map((e) => ({ value: e.canonicalUrl, statusCode: e.statusCode }));
      break;
    case 'emails':
      out = entities.emails.map((e) => ({ value: e.address }));
      break;
    default: {
      const _exhaustive: never = from;
      throw new Error(`Unknown context path: ${String(_exhaustive)}`);
    }
  }
  // Ordinal (code-point) sort — deterministic across Node/ICU builds, unlike
  // localeCompare. This ordering feeds both dispatch order and the audit.
  return [...out].sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

export interface FilterOutcome {
  kept: Candidate[];
  evaluated: { value: string; keep: boolean; filters: PredicateEval[] }[];
}

/** Applique les filtres : une cible est gardée si TOUS les filtres passent. */
export function applyFilters(
  candidates: Candidate[],
  filters: Predicate[] | undefined,
  world: WorldState,
): FilterOutcome {
  const evaluated = candidates.map((c) => {
    const fs = (filters ?? []).map((f) => evalFilter(f, c, world));
    const keep = fs.every((e) => e.passed);
    return { value: c.value, keep, filters: fs };
  });
  const keepSet = new Set(evaluated.filter((e) => e.keep).map((e) => e.value));
  const kept = candidates.filter((c) => keepSet.has(c.value));
  return { kept, evaluated };
}
