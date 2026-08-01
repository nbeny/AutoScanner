import { RULESET, type ComplianceControl, type ComplianceRuleset } from './ruleset';

export interface MapFindingInput {
  category?: string | null;
  cveId?: string | null;
}

/**
 * Pure finding → control-framework mapper (SP2d). v1 resolves controls by the finding's
 * structural category via the ruleset; unknown categories yield nothing rather than a guess.
 * Kept pure and injectable-of-ruleset so the rule table is unit-tested independently.
 */
export function mapFinding(
  input: MapFindingInput,
  ruleset: ComplianceRuleset = RULESET,
): ComplianceControl[] {
  const category = input.category?.trim().toLowerCase();
  if (!category) return [];

  const controls = ruleset.byCategory[category];
  if (!controls) return [];

  // De-dupe on (framework, controlId) so a ruleset typo can't create duplicate rows.
  const seen = new Set<string>();
  const out: ComplianceControl[] = [];
  for (const c of controls) {
    const key = `${c.framework}|${c.controlId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
