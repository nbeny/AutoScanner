import { Wafw00fJsonParser } from '../wafw00f-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'wafw00f',
  target: 'example.com',
  engagementId: 'e',
};

describe('Wafw00fJsonParser', () => {
  const parser = new Wafw00fJsonParser();

  it('emits a WAF Technology for each detected firewall', async () => {
    const input = JSON.stringify([
      {
        url: 'https://example.com',
        detected: true,
        firewall: 'Cloudflare',
        manufacturer: 'Cloudflare',
      },
    ]);
    const out = await parser.parse(input, ctx);
    expect(out.technologies).toHaveLength(1);
    expect(out.technologies[0]).toEqual(
      expect.objectContaining({
        assetValue: 'example.com',
        name: 'WAF: Cloudflare',
        categories: ['waf'],
      }),
    );
  });

  it('emits nothing when not detected, and is tolerant of blank/garbage', async () => {
    expect(
      (
        await parser.parse(
          JSON.stringify([{ url: 'https://x', detected: false, firewall: 'None' }]),
          ctx,
        )
      ).technologies,
    ).toHaveLength(0);
    expect((await parser.parse('', ctx)).technologies).toHaveLength(0);
    expect((await parser.parse('not json', ctx)).technologies).toHaveLength(0);
  });
});
