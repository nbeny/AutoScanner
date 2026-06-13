import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KatanaJsonParser } from '../katana-json/katana-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'katana-sample.jsonl'), 'utf8');

const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'katana',
  target: 'example.com',
  engagementId: 'eng_1',
};

describe('KatanaJsonParser', () => {
  const parser = new KatanaJsonParser();

  it('declares name and supported formats', () => {
    expect(parser.name).toBe('katana-json');
    expect(parser.formats).toEqual(['JSONL']);
  });

  it('parses fixture and yields 3 endpoints (malformed line + missing endpoint skipped)', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.endpoints.length).toBe(3);
  });

  it('first endpoint has url, method, statusCode, contentLength', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.endpoints[0]).toEqual({
      url: 'https://example.com/',
      method: 'GET',
      statusCode: 200,
      contentLength: 100,
    });
  });

  it('POST endpoint without response has url and method but no statusCode/contentLength', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const post = out.endpoints.find((e) => e.method === 'POST');
    expect(post).toBeDefined();
    expect(post?.url).toBe('https://example.com/login');
    expect(post?.statusCode).toBeUndefined();
    expect(post?.contentLength).toBeUndefined();
  });

  it('endpoints land in out.endpoints (not out.assets)', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.assets).toEqual([]);
    expect(out.endpoints.length).toBeGreaterThan(0);
  });

  it('skips malformed JSON lines without throwing', async () => {
    const out = await parser.parse(
      'not-json\n{"request":{"method":"GET","endpoint":"https://x.com/"}}',
      ctx,
    );
    expect(out.endpoints.length).toBe(1);
  });

  it('skips lines without request.endpoint without throwing', async () => {
    const out = await parser.parse('{"response":{"status_code":500}}', ctx);
    expect(out.endpoints).toEqual([]);
  });

  it('returns empty output for empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.endpoints).toEqual([]);
  });

  it('accepts Buffer input', async () => {
    const out = await parser.parse(Buffer.from(FIXTURE, 'utf8'), ctx);
    expect(out.endpoints.length).toBe(3);
  });
});
