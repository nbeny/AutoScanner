import { QueueName } from '../queue-names';

describe('QueueName', () => {
  it('includes CVE_ENRICHMENT', () => {
    expect(QueueName.CVE_ENRICHMENT).toBe('cve-enrichment');
  });

  it('includes AI_RUNS', () => {
    expect(QueueName.AI_RUNS).toBe('ai-runs');
  });
});
