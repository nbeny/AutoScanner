import { SarifBuilder, type SarifFindingInput } from '../sarif-builder';

describe('SarifBuilder', () => {
  const builder = new SarifBuilder();

  it('builds a SARIF 2.1.0 envelope', () => {
    const sarif = builder.build([], '0.1.0');
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe('AutoScanner');
    expect(sarif.runs[0].tool.driver.version).toBe('0.1.0');
  });

  it('maps severities to SARIF levels', () => {
    const findings: SarifFindingInput[] = [
      { ruleId: 'r-crit', severity: 'CRITICAL', title: 'crit' },
      { ruleId: 'r-high', severity: 'HIGH', title: 'high' },
      { ruleId: 'r-med', severity: 'MEDIUM', title: 'med' },
      { ruleId: 'r-low', severity: 'LOW', title: 'low' },
      { ruleId: 'r-info', severity: 'INFO', title: 'info' },
    ];
    const sarif = builder.build(findings, '0.1.0');
    const levels = sarif.runs[0].results.map((r) => r.level);
    expect(levels).toEqual(['error', 'error', 'warning', 'note', 'note']);
  });

  it('dedupes rules by ruleId', () => {
    const findings: SarifFindingInput[] = [
      { ruleId: 'same', severity: 'HIGH', title: 't1' },
      { ruleId: 'same', severity: 'HIGH', title: 't2' },
      { ruleId: 'other', severity: 'LOW', title: 't3' },
    ];
    const sarif = builder.build(findings, '0.1.0');
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(2);
    expect(sarif.runs[0].results).toHaveLength(3);
  });

  it('attaches an artifactLocation when assetCanonicalValue is provided', () => {
    const sarif = builder.build(
      [
        {
          ruleId: 'r1',
          severity: 'HIGH',
          title: 't',
          assetCanonicalValue: 'api.example.com',
        },
      ],
      '0.1.0',
    );
    expect(sarif.runs[0].results[0].locations?.[0].physicalLocation.artifactLocation.uri).toBe(
      'api.example.com',
    );
  });

  it('round-trips through JSON.stringify cleanly', () => {
    const sarif = builder.build(
      [{ ruleId: 'r1', severity: 'CRITICAL', title: 'boom', description: 'long desc' }],
      '0.1.0',
    );
    const reparsed = JSON.parse(JSON.stringify(sarif));
    expect(reparsed.version).toBe('2.1.0');
    expect(reparsed.runs[0].results[0].message.text).toBe('long desc');
  });
});
