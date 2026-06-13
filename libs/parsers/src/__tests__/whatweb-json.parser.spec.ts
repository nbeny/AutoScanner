import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WhatwebJsonParser } from '../whatweb-json/whatweb-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'whatweb-sample.json'), 'utf8');

const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'whatweb',
  target: 'https://example.com',
  engagementId: 'eng_1',
};

describe('WhatwebJsonParser', () => {
  const parser = new WhatwebJsonParser();

  it('declares name and supported formats', () => {
    expect(parser.name).toBe('whatweb-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('emits technology for nginx with version', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.technologies).toContainEqual({
      assetValue: 'example.com',
      name: 'nginx',
      version: '1.25.3',
    });
  });

  it('emits technology for jQuery with version', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.technologies).toContainEqual({
      assetValue: 'example.com',
      name: 'jQuery',
      version: '3.6.0',
    });
  });

  it('emits technology for HTML5 without version', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const html5 = out.technologies.find((t) => t.name === 'HTML5');
    expect(html5).toBeDefined();
    expect(html5?.assetValue).toBe('example.com');
    expect(html5?.version).toBeUndefined();
  });

  it('emits technology for Country plugin', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const country = out.technologies.find((t) => t.name === 'Country');
    expect(country).toBeDefined();
    expect(country?.assetValue).toBe('example.com');
  });

  it('sets assetValue to hostname for all technologies', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    for (const tech of out.technologies) {
      expect(tech.assetValue).toBe('example.com');
    }
  });

  it('emits 4 technologies from the fixture', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.technologies).toHaveLength(4);
  });

  it('returns empty technologies for invalid JSON without throwing', async () => {
    const out = await parser.parse('not valid json {{{', ctx);
    expect(out.technologies).toEqual([]);
  });

  it('returns empty technologies for empty string without throwing', async () => {
    const out = await parser.parse('', ctx);
    expect(out.technologies).toEqual([]);
  });

  it('accepts Buffer input', async () => {
    const out = await parser.parse(Buffer.from(FIXTURE, 'utf8'), ctx);
    expect(out.technologies).toHaveLength(4);
  });

  it('handles target with malformed URL by using raw target string as assetValue', async () => {
    const badTarget = '[{"target":"not-a-url","http_status":200,"plugins":{"Apache":{}}}]';
    const out = await parser.parse(badTarget, ctx);
    expect(out.technologies).toHaveLength(1);
    expect(out.technologies[0].assetValue).toBe('not-a-url');
  });
});
