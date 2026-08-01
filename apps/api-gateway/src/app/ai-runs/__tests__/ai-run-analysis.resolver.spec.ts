import { AiRunsResolver } from '../ai-runs.resolver';
import type { AiRunObject } from '../dto/ai-run.object';

function resolver() {
  return new AiRunsResolver({} as never, {} as never);
}

const enriched = {
  title: 'Log4Shell',
  severity: 'CRITICAL',
  cveId: 'CVE-2021-44228',
  impact: 'RCE',
  priority: 'CRITICAL',
  action: 'Upgrade log4j',
  confidence: 92,
  status: 'confirmed',
  remediation: ['Upgrade to 2.17'],
  degraded: false,
};

describe('AiRunsResolver.analysis (SP4d)', () => {
  it('surfaces AiRun.analysisJson.findings as the analysis field', () => {
    const run = { id: 'r1', analysisJson: { findings: [enriched] } } as unknown as AiRunObject;

    const out = resolver().analysis(run);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'Log4Shell', priority: 'CRITICAL', confidence: 92 });
  });

  it('returns an empty array when the run has no analysis yet', () => {
    expect(resolver().analysis({ id: 'r1' } as unknown as AiRunObject)).toEqual([]);
    expect(resolver().analysis({ id: 'r1', analysisJson: null } as unknown as AiRunObject)).toEqual(
      [],
    );
  });

  it('tolerates a malformed analysisJson shape', () => {
    const run = { id: 'r1', analysisJson: { findings: 'nope' } } as unknown as AiRunObject;
    expect(resolver().analysis(run)).toEqual([]);
  });
});
