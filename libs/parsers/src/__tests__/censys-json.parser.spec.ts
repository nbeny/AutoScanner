import * as path from 'path';
import * as fs from 'fs';
import { CensysJsonParser } from '../censys-json/censys-json.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  engagementId: 'e',
  scannerName: 'censys',
  target: 'example.com',
};

const fixturePath = path.join(__dirname, 'fixtures', 'censys-sample.json');

describe('CensysJsonParser', () => {
  let parser: CensysJsonParser;

  beforeEach(() => {
    parser = new CensysJsonParser();
  });

  it('has name censys-json and formats [JSON]', () => {
    expect(parser.name).toBe('censys-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('parses the fixture and yields exactly one ORG orgMetadata entry', async () => {
    const body = fs.readFileSync(fixturePath, 'utf8');
    const out = await parser.parse(body, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    const [meta] = out.orgMetadata;
    expect(meta.kind).toBe('ORG');
    const data = meta.data as Array<{ ip: string }>;
    expect(data).toEqual(JSON.parse(body));
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
