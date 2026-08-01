import { mapFinding } from '../mappings/mapper';
import type { ComplianceRuleset } from '../mappings/ruleset';

const ruleset: ComplianceRuleset = {
  version: 1,
  byCategory: {
    'sql-injection': [
      {
        framework: 'OWASP_TOP10',
        controlId: 'A03:2021',
        controlTitle: 'Injection',
        confidence: 0.9,
      },
      { framework: 'CWE', controlId: 'CWE-89', controlTitle: 'SQL Injection', confidence: 0.9 },
      // duplicate — must be collapsed
      { framework: 'CWE', controlId: 'CWE-89', controlTitle: 'SQL Injection', confidence: 0.5 },
    ],
  },
};

describe('mapFinding', () => {
  it('returns the controls for a known category', () => {
    const controls = mapFinding({ category: 'sql-injection' }, ruleset);
    expect(controls.map((c) => c.controlId)).toEqual(['A03:2021', 'CWE-89']);
  });

  it('is case- and whitespace-insensitive on the category', () => {
    expect(mapFinding({ category: '  SQL-Injection ' }, ruleset)).toHaveLength(2);
  });

  it('de-duplicates on (framework, controlId)', () => {
    const cwe = mapFinding({ category: 'sql-injection' }, ruleset).filter(
      (c) => c.framework === 'CWE',
    );
    expect(cwe).toHaveLength(1);
  });

  it('returns nothing for an unknown category', () => {
    expect(mapFinding({ category: 'unheard-of' }, ruleset)).toEqual([]);
  });

  it('returns nothing when the category is null/empty', () => {
    expect(mapFinding({ category: null }, ruleset)).toEqual([]);
    expect(mapFinding({ category: '' }, ruleset)).toEqual([]);
  });
});
