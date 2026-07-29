import { GitDumperJsonParser } from '../git-dumper-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'git-dumper',
  target: 'https://victim.example',
  engagementId: 'e',
};

describe('GitDumperJsonParser', () => {
  const parser = new GitDumperJsonParser();

  it('maps probe findings to NormalizedFindings at the git URL', async () => {
    const report = JSON.stringify({
      gitUrl: 'https://victim.example/.git/',
      exposed: true,
      findings: [
        {
          id: 'exposed-git',
          severity: 'HIGH',
          title: 'Exposed .git directory',
          detail: 'HEAD reachable',
        },
        {
          id: 'secret',
          severity: 'CRITICAL',
          title: 'Secret in exposed git repo',
          detail: 'AWS key',
        },
      ],
    });
    const out = await parser.parse(report, ctx);
    expect(out.findings).toHaveLength(2);
    expect(out.findings[0]).toMatchObject({
      scannerName: 'git-dumper',
      title: 'Exposed .git directory',
      severity: 'HIGH',
      location: 'https://victim.example/.git/',
    });
    expect(out.findings[1].severity).toBe('CRITICAL');
  });

  it('returns no findings when not exposed', async () => {
    const out = await parser.parse(
      JSON.stringify({ gitUrl: 'x', exposed: false, findings: [] }),
      ctx,
    );
    expect(out.findings).toEqual([]);
  });

  it('returns empty output on empty / null / garbage input', async () => {
    expect((await parser.parse('', ctx)).findings).toEqual([]);
    expect((await parser.parse('null', ctx)).findings).toEqual([]);
    expect((await parser.parse('not json', ctx)).findings).toEqual([]);
  });

  it('clamps an unknown severity to INFO', async () => {
    const report = JSON.stringify({ gitUrl: 'u', findings: [{ title: 't', severity: 'ZZZ' }] });
    const out = await parser.parse(report, ctx);
    expect(out.findings[0].severity).toBe('INFO');
  });
});
