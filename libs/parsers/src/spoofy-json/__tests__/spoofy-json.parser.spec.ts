import { SpoofyJsonParser } from '../spoofy-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'spoofy',
  target: 'acme.tld',
  engagementId: 'e',
};

describe('SpoofyJsonParser', () => {
  const parser = new SpoofyJsonParser();

  it('maps verdict=Spoofable → HIGH (SPOOFY_SPOOFABLE)', async () => {
    const text = JSON.stringify({ domain: 'easy.example', verdict: 'Spoofable' });
    const out = await parser.parse(text, ctx);
    expect(out.findings[0]).toMatchObject({
      scannerName: 'spoofy',
      title: 'SPOOFY_SPOOFABLE',
      severity: 'HIGH',
      location: 'easy.example',
    });
  });

  it('maps verdict containing "Spoofable via SPF" → MEDIUM (SPOOFY_SPF_SPOOFABLE)', async () => {
    const text = JSON.stringify({ domain: 'spf.example', verdict: 'Spoofable via SPF' });
    const out = await parser.parse(text, ctx);
    expect(out.findings[0]).toMatchObject({
      title: 'SPOOFY_SPF_SPOOFABLE',
      severity: 'MEDIUM',
    });
  });

  it('maps verdict containing "Spoofable via DMARC" → MEDIUM (SPOOFY_DMARC_SPOOFABLE)', async () => {
    const text = JSON.stringify({ domain: 'dm.example', verdict: 'Spoofable via DMARC' });
    const out = await parser.parse(text, ctx);
    expect(out.findings[0]).toMatchObject({
      title: 'SPOOFY_DMARC_SPOOFABLE',
      severity: 'MEDIUM',
    });
  });

  it('emits no Finding for verdict=Not Spoofable', async () => {
    const text = JSON.stringify({ domain: 'safe.example', verdict: 'Not Spoofable' });
    const out = await parser.parse(text, ctx);
    expect(out.findings).toHaveLength(0);
  });

  it('handles malformed JSON without throwing', async () => {
    expect((await parser.parse('not-json', ctx)).findings).toHaveLength(0);
  });
});
