import type { ClaudeAgentService } from '@autoscanner/claude-agent';

import { FindingAnalystAgent } from '../agents/finding-analyst.agent';
import { FalsePositiveAgent } from '../agents/false-positive.agent';
import { RemediationAgent } from '../agents/remediation.agent';

function claudeReturning(text: string | Error): ClaudeAgentService {
  return {
    complete: jest.fn(async () => {
      if (text instanceof Error) throw text;
      return { text };
    }),
  } as unknown as ClaudeAgentService;
}

describe('FindingAnalystAgent', () => {
  it('returns the analysed impact/priority/action from Claude', async () => {
    const claude = claudeReturning(
      '{"summary":"Log4Shell","impact":"RCE","priority":"CRITICAL","action":"Upgrade log4j"}',
    );
    const res = await new FindingAnalystAgent(claude).run({
      title: 'Log4Shell',
      severity: 'CRITICAL',
      cveId: 'CVE-2021-44228',
    });
    expect(res.degraded).toBe(false);
    expect(res.output).toMatchObject({ priority: 'CRITICAL', action: 'Upgrade log4j' });
  });

  it('falls back to a severity-derived priority when Claude is empty', async () => {
    const res = await new FindingAnalystAgent(claudeReturning('')).run({
      title: 'Weak TLS',
      severity: 'MEDIUM',
    });
    expect(res.degraded).toBe(true);
    expect(res.output.priority).toBe('MEDIUM');
  });
});

describe('FalsePositiveAgent', () => {
  it('parses a confidence + status verdict', async () => {
    const res = await new FalsePositiveAgent(
      claudeReturning('{"confidence":92,"status":"confirmed","reason":"reproduced"}'),
    ).run({ title: 'SQLi', severity: 'HIGH' });
    expect(res.output).toMatchObject({ confidence: 92, status: 'confirmed' });
  });

  it('rejects an out-of-range confidence and falls back to suspected', async () => {
    const res = await new FalsePositiveAgent(
      claudeReturning('{"confidence":250,"status":"confirmed"}'),
    ).run({ title: 'SQLi', severity: 'HIGH' });
    expect(res.degraded).toBe(true);
    expect(res.output.status).toBe('suspected');
  });
});

describe('RemediationAgent', () => {
  it('returns concrete steps and an audience', async () => {
    const res = await new RemediationAgent(
      claudeReturning(
        '{"summary":"Fix SQLi","steps":["Use parameterised queries","Add DTO validation"],"audience":"developer"}',
      ),
    ).run({ title: 'SQLi', severity: 'HIGH', technology: 'NestJS' });
    expect(res.output.audience).toBe('developer');
    expect(res.output.steps.length).toBeGreaterThan(0);
  });

  it('falls back to generic hardening steps when Claude throws', async () => {
    const res = await new RemediationAgent(claudeReturning(new Error('quota'))).run({
      title: 'Outdated Apache',
      severity: 'HIGH',
      cveId: 'CVE-2025-1',
    });
    expect(res.degraded).toBe(true);
    expect(res.output.steps.some((s) => s.includes('CVE-2025-1'))).toBe(true);
  });
});
