import type { ClaudeAgentService } from '@autoscanner/claude-agent';

import { TechnologyIdAgent } from '../agents/technology-id.agent';
import { PlannerAgent } from '../agents/planner.agent';
import { AssetDiscoveryAgent } from '../agents/asset-discovery.agent';
import { selectPlaybooks } from '../playbook-ruleset';

function claude(text: string | Error): ClaudeAgentService {
  return {
    complete: jest.fn(async () => {
      if (text instanceof Error) throw text;
      return { text };
    }),
  } as unknown as ClaudeAgentService;
}

describe('selectPlaybooks (playbook decision engine)', () => {
  it('maps GraphQL to the GraphQL playbook + scanners', () => {
    const rules = selectPlaybooks(['GraphQL', 'nginx']);
    const names = rules.map((r) => r.playbook);
    expect(names).toContain('GRAPHQL_SECURITY');
    expect(names).toContain('WEB_SERVER_SECURITY');
    expect(rules.find((r) => r.playbook === 'GRAPHQL_SECURITY')?.scanners).toContain('graphw00f');
  });

  it('de-duplicates playbooks across technologies', () => {
    const rules = selectPlaybooks(['ldap', 'active-directory']); // both -> AD_SECURITY
    expect(rules.filter((r) => r.playbook === 'AD_SECURITY')).toHaveLength(1);
  });

  it('returns nothing for unrecognised technologies', () => {
    expect(selectPlaybooks(['cobol'])).toEqual([]);
  });
});

describe('TechnologyIdAgent', () => {
  it('parses the detected technology list', async () => {
    const res = await new TechnologyIdAgent(
      claude('{"technologies":[{"name":"nginx","version":"1.18","confidence":90}]}'),
    ).run({ host: 'x', services: ['http'] });
    expect(res.output.technologies[0]).toMatchObject({ name: 'nginx', version: '1.18' });
  });

  it('falls back to raw services as low-confidence tech when Claude is empty', async () => {
    const res = await new TechnologyIdAgent(claude('')).run({ host: 'x', services: ['ssh'] });
    expect(res.degraded).toBe(true);
    expect(res.output.technologies).toEqual([{ name: 'ssh', confidence: 30 }]);
  });
});

describe('PlannerAgent', () => {
  it('returns the AI-chosen playbooks', async () => {
    const res = await new PlannerAgent(
      claude('{"playbooks":[{"name":"API_SECURITY","scanners":["nuclei"]}]}'),
    ).run({ assetValue: 'api.x.com', technologies: ['GraphQL'] });
    expect(res.output.playbooks[0].name).toBe('API_SECURITY');
  });

  it('falls back to the deterministic ruleset when Claude throws', async () => {
    const res = await new PlannerAgent(claude(new Error('quota'))).run({
      assetValue: 'api.x.com',
      technologies: ['GraphQL'],
    });
    expect(res.degraded).toBe(true);
    expect(res.output.playbooks.map((p) => p.name)).toContain('GRAPHQL_SECURITY');
  });
});

describe('AssetDiscoveryAgent', () => {
  it('falls back to echoing the discovered entities', async () => {
    const res = await new AssetDiscoveryAgent(claude('not json')).run({
      target: 'x.com',
      discoveredAssets: [{ type: 'domain', value: 'x.com', technologies: ['nginx'] }],
    });
    expect(res.degraded).toBe(true);
    expect(res.output.assets[0]).toMatchObject({ value: 'x.com', technologies: ['nginx'] });
  });
});
