export interface TopicDef {
  partitions: number;
  group: string;
}

export const TOPICS = {
  'security.scanner.requested': { partitions: 6, group: 'scanner-worker' },
  'security.parse.requested': { partitions: 6, group: 'parser-worker' },
  'security.scan.requested': { partitions: 3, group: 'orchestrator' },
  'security.ai.run.requested': { partitions: 3, group: 'ai-orchestrator' },
  'security.cve.enrich.requested': { partitions: 4, group: 'cve-enricher' },
  'security.cve.discovery.requested': { partitions: 4, group: 'cve-enricher-discovery' },
  'security.nvd.sync.requested': { partitions: 1, group: 'nvd-sync' },
  'security.report.requested': { partitions: 2, group: 'report-worker' },
  'security.notification.requested': { partitions: 2, group: 'notification-worker' },
  'security.webhook.ingest.requested': { partitions: 2, group: 'webhook-worker' },
  'security.asset.upserted': { partitions: 6, group: 'asset-upserted' },
  'security.asset.risk.changed': { partitions: 6, group: 'asset-risk-changed' },
  'security.discovery.entity.upserted': { partitions: 6, group: 'discovery-entity-upserted' },
} as const satisfies Record<string, TopicDef>;

export type TopicName = keyof typeof TOPICS;

export const retryTopic = (t: string): string => `${t}.retry`;
export const dlqTopic = (t: string): string => `${t}.dlq`;

export function allProvisionSpecs(): Array<{ topic: string; partitions: number }> {
  const specs: Array<{ topic: string; partitions: number }> = [];
  for (const [name, def] of Object.entries(TOPICS)) {
    specs.push({ topic: name, partitions: def.partitions });
    specs.push({ topic: retryTopic(name), partitions: def.partitions });
    specs.push({ topic: dlqTopic(name), partitions: 1 });
  }
  return specs;
}
