import { WebanalyzeJsonParser } from '../webanalyze-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'webanalyze',
  target: 'example.com',
  engagementId: 'e',
};

const SAMPLE = JSON.stringify({
  hostname: 'https://example.com',
  matches: [
    { app_name: 'nginx', version: '1.25.3', categories: ['Web servers'] },
    { app_name: 'React', version: '', categories: ['JavaScript frameworks'] },
  ],
});

describe('WebanalyzeJsonParser', () => {
  it('maps each match to a technology tied to the host', async () => {
    const out = await new WebanalyzeJsonParser().parse(SAMPLE, ctx);
    expect(out.technologies).toHaveLength(2);
    expect(out.technologies[0]).toEqual({
      assetValue: 'example.com',
      name: 'nginx',
      version: '1.25.3',
      categories: ['Web servers'],
    });
    expect(out.technologies[1]).toMatchObject({ name: 'React', version: undefined });
  });

  it('returns empty output for blank input', async () => {
    expect((await new WebanalyzeJsonParser().parse('', ctx)).technologies).toHaveLength(0);
  });
});
