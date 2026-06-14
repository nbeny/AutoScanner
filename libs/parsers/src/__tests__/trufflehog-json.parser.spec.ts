import { TrufflehogJsonParser } from '../trufflehog-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'trufflehog',
  target: 'example.com',
  engagementId: 'e',
};

describe('TrufflehogJsonParser', () => {
  const parser = new TrufflehogJsonParser();

  it('maps verified secret → CRITICAL, unverified → HIGH; dedups; location from repo', async () => {
    const input = [
      JSON.stringify({
        DetectorName: 'AWS',
        Verified: true,
        SourceMetadata: {
          Data: { Github: { repository: 'https://github.com/example/app', file: 'a.env' } },
        },
      }),
      JSON.stringify({
        DetectorName: 'Slack',
        Verified: false,
        SourceMetadata: {
          Data: { Github: { repository: 'https://github.com/example/web', file: 'b.js' } },
        },
      }),
    ].join('\n');
    const out = await parser.parse(input, ctx);
    expect(out.findings).toHaveLength(2);
    const aws = out.findings.find((f) => f.title.includes('AWS'));
    expect(aws?.severity).toBe('CRITICAL');
    const slack = out.findings.find((f) => f.title.includes('Slack'));
    expect(slack?.severity).toBe('HIGH');
    expect(aws?.location).toContain('github.com/example/app');
  });

  it('returns empty on blank/garbage', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
  });
});
