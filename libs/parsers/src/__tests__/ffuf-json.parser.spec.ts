import * as path from 'path';
import * as fs from 'fs';
import { FfufJsonParser } from '../ffuf-json/ffuf-json.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  engagementId: 'e',
  scannerName: 'ffuf',
  target: 'example.com',
};

const fixturePath = path.join(__dirname, 'fixtures', 'ffuf-sample.json');

describe('FfufJsonParser', () => {
  let parser: FfufJsonParser;

  beforeEach(() => {
    parser = new FfufJsonParser();
  });

  it('has name ffuf-json and formats [JSON]', () => {
    expect(parser.name).toBe('ffuf-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('parses the fixture and yields 2 endpoints', async () => {
    const body = fs.readFileSync(fixturePath, 'utf8');
    const out = await parser.parse(body, ctx);
    expect(out.endpoints).toHaveLength(2);
    expect(out.endpoints[0]).toEqual({
      url: 'https://example.com/admin',
      method: 'GET',
      statusCode: 200,
      contentLength: 345,
    });
    expect(out.endpoints[1]).toEqual({
      url: 'https://example.com/login',
      method: 'GET',
      statusCode: 301,
      contentLength: 0,
    });
  });

  it('returns empty endpoints on invalid JSON (no throw)', async () => {
    const out = await parser.parse('not valid json }{', ctx);
    expect(out.endpoints).toEqual([]);
  });

  it('returns empty endpoints when results key is absent', async () => {
    const out = await parser.parse('{"commandline":"ffuf -u ...","time":"1s"}', ctx);
    expect(out.endpoints).toEqual([]);
  });
});
