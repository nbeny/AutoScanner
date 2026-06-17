import { compareCpeVersions } from './cpe-version';

export interface ParsedCpe {
  vendor: string;
  product: string;
  version: string; // '*' or '-' means not pinned
}

export interface MatchCriterion {
  criteria: string;
  vulnerable: boolean;
  versionStartIncluding?: string | null;
  versionStartExcluding?: string | null;
  versionEndIncluding?: string | null;
  versionEndExcluding?: string | null;
}

export interface ConfigNode {
  operator: 'AND' | 'OR';
  negate: boolean;
  matches: MatchCriterion[];
}

export function parseCpe(cpe: string): ParsedCpe {
  const parts = cpe.split(':');
  return { vendor: parts[3] ?? '*', product: parts[4] ?? '*', version: parts[5] ?? '*' };
}

function isConcrete(v: string | undefined): boolean {
  return !!v && v !== '*' && v !== '-';
}

function hasBounds(m: MatchCriterion): boolean {
  return !!(
    m.versionStartIncluding ||
    m.versionStartExcluding ||
    m.versionEndIncluding ||
    m.versionEndExcluding
  );
}

export function cpeMatchApplies(target: ParsedCpe, m: MatchCriterion): boolean {
  const crit = parseCpe(m.criteria);
  if (crit.vendor !== target.vendor || crit.product !== target.product) return false;
  // criterion pins a concrete version → exact compare (target must have a concrete version)
  if (isConcrete(crit.version)) {
    return isConcrete(target.version) && compareCpeVersions(target.version, crit.version) === 0;
  }
  // criterion is a version-range (or bare wildcard). Need a concrete target version to place it.
  if (!isConcrete(target.version)) {
    // wildcard criterion vs wildcard target with no bounds = applies; bounds + wildcard target = conservative false
    return !hasBounds(m);
  }
  const tv = target.version;
  if (m.versionStartIncluding && compareCpeVersions(tv, m.versionStartIncluding) < 0) return false;
  if (m.versionStartExcluding && compareCpeVersions(tv, m.versionStartExcluding) <= 0) return false;
  if (m.versionEndIncluding && compareCpeVersions(tv, m.versionEndIncluding) > 0) return false;
  if (m.versionEndExcluding && compareCpeVersions(tv, m.versionEndExcluding) >= 0) return false;
  return true;
}

export function evaluateNode(node: ConfigNode, target: ParsedCpe): boolean {
  const vuln = node.matches.filter((m) => m.vulnerable);
  let result: boolean;
  if (node.operator === 'AND') {
    // conservative: every vulnerable condition must be on our product AND apply.
    // a vulnerable condition on a different product can't be confirmed from one CPE → false.
    result =
      vuln.length > 0 &&
      vuln.every((m) => {
        const crit = parseCpe(m.criteria);
        if (crit.vendor !== target.vendor || crit.product !== target.product) return false;
        return cpeMatchApplies(target, m);
      });
  } else {
    result = vuln.some((m) => cpeMatchApplies(target, m));
  }
  return node.negate ? !result : result;
}

export function cveApplies(nodes: ConfigNode[], target: ParsedCpe): boolean {
  return nodes.some((n) => evaluateNode(n, target));
}
