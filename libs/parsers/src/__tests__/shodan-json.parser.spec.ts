import * as path from 'path';
import * as fs from 'fs';
import { ShodanJsonParser } from '../shodan-json/shodan-json.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  engagementId: 'e',
  scannerName: 'shodan',
  target: 'example.com',
};

const fixturePath = path.join(__dirname, 'fixtures', 'shodan-sample.json');

describe('ShodanJsonParser', () => {
  let parser: ShodanJsonParser;

  beforeEach(() => {
    parser = new ShodanJsonParser();
  });

  it('has name shodan-json and formats [JSON]', () => {
    expect(parser.name).toBe('shodan-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('parses the fixture and yields exactly one ORG orgMetadata entry', async () => {
    const body = fs.readFileSync(fixturePath, 'utf8');
    const out = await parser.parse(body, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    const [meta] = out.orgMetadata;
    expect(meta.kind).toBe('ORG');
    const data = meta.data as { domain: string };
    expect(data.domain).toBe('example.com');
  });

  it('returns empty orgMetadata on invalid JSON without throwing', async () => {
    const out = await parser.parse('not valid json }{', ctx);
    expect(out.orgMetadata).toEqual([]);
  });

  it('returns empty orgMetadata for empty/whitespace input without throwing', async () => {
    const out = await parser.parse('   ', ctx);
    expect(out.orgMetadata).toEqual([]);
  });

  it('returns empty orgMetadata when parsed value is null', async () => {
    const out = await parser.parse('null', ctx);
    expect(out.orgMetadata).toEqual([]);
  });
});
