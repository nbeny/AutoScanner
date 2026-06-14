import { JsReconJsonParser } from '../js-recon-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'js-recon',
  target: 'example.com',
  engagementId: 'e',
};

describe('JsReconJsonParser', () => {
  const parser = new JsReconJsonParser();

  it('maps endpoints → Endpoint and secrets → Finding (MEDIUM)', async () => {
    const input = JSON.stringify({
      endpoints: ['/api/users', 'https://example.com/admin', '/api/users'],
      secrets: [
        { type: 'aws_access_key', match: 'AKIAEXAMPLE', jsUrl: 'https://example.com/app.js' },
      ],
    });
    const out = await parser.parse(input, ctx);
    const urls = out.endpoints.map((e) => e.url).sort();
    expect(urls).toEqual(['/api/users', 'https://example.com/admin']); // deduped
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toEqual(
      expect.objectContaining({
        scannerName: 'js-recon',
        severity: 'MEDIUM',
        location: 'https://example.com/app.js',
      }),
    );
    expect(out.findings[0].title).toContain('aws_access_key');
  });

  it('tolerant of blank/garbage/missing keys', async () => {
    expect((await parser.parse('', ctx)).endpoints).toHaveLength(0);
    expect((await parser.parse('{}', ctx)).findings).toHaveLength(0);
  });
});
