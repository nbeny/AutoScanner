import { TOPICS, retryTopic, dlqTopic, allProvisionSpecs } from './topics';

describe('topics', () => {
  it('exposes all 10 SP0 topics', () => {
    expect(Object.keys(TOPICS)).toEqual(
      expect.arrayContaining([
        'security.scanner.requested',
        'security.parse.requested',
        'security.scan.requested',
        'security.ai.run.requested',
        'security.cve.enrich.requested',
        'security.cve.discovery.requested',
        'security.nvd.sync.requested',
        'security.report.requested',
        'security.notification.requested',
        'security.webhook.ingest.requested',
      ]),
    );
    expect(Object.keys(TOPICS)).toHaveLength(17);
  });

  it('includes the SP1 asset and discovery lifecycle topics', () => {
    expect(Object.keys(TOPICS)).toEqual(
      expect.arrayContaining([
        'security.asset.upserted',
        'security.asset.risk.changed',
        'security.discovery.entity.upserted',
      ]),
    );
  });

  it('includes the SP2a finding lifecycle topics', () => {
    expect(Object.keys(TOPICS)).toEqual(
      expect.arrayContaining([
        'security.finding.created',
        'security.finding.updated',
        'security.finding.confirmed',
        'security.finding.closed',
      ]),
    );
  });

  it('derives retry and dlq names', () => {
    expect(retryTopic('security.report.requested')).toBe('security.report.requested.retry');
    expect(dlqTopic('security.report.requested')).toBe('security.report.requested.dlq');
  });

  it('provision specs include main + retry + dlq for every topic', () => {
    const names = allProvisionSpecs().map((s) => s.topic);
    expect(names).toContain('security.report.requested');
    expect(names).toContain('security.report.requested.retry');
    expect(names).toContain('security.report.requested.dlq');
    expect(names).toHaveLength(17 * 3);
  });

  it('gives dlq topics a single partition', () => {
    const dlq = allProvisionSpecs().find((s) => s.topic === 'security.report.requested.dlq');
    expect(dlq?.partitions).toBe(1);
  });
});
