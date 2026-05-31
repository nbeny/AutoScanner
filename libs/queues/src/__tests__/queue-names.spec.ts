import { QueueName } from '../queue-names';

describe('QueueName', () => {
  it('includes CVE_ENRICHMENT', () => {
    expect(QueueName.CVE_ENRICHMENT).toBe('cve-enrichment');
  });
});
