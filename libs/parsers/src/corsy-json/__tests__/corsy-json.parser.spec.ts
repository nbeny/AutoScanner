import { CorsyJsonParser } from '../corsy-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'corsy',
  target: 'https://acme.tld',
  engagementId: 'e',
};

const SAMPLE = JSON.stringify({
  'https://acme.tld/api1': {
    class: 'Origin Reflected',
    acac: true,
    description: 'reflects-origin-with-creds',
  },
  'https://acme.tld/api2': { class: 'Origin Reflected', acac: false },
  'https://acme.tld/api3': { class: 'Pre-domain bypass' },
  'https://acme.tld/api4': { class: 'Third-Party Allowed', acao: 'https://thirdparty.io' },
  'https://acme.tld/api5': { class: 'HTTP Origin Allowed' },
  'https://acme.tld/api6': { class: 'Unknown misconfig' },
});

describe('CorsyJsonParser — exhaustive severity mapping', () => {
  it('maps CORS_WILDCARD_WITH_CREDS (Origin Reflected + acac=true) → CRITICAL', async () => {
    const out = await new CorsyJsonParser().parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.location === 'https://acme.tld/api1');
    expect(f).toMatchObject({
      scannerName: 'corsy',
      severity: 'CRITICAL',
      title: 'CORS_WILDCARD_WITH_CREDS',
    });
  });

  it('maps CORS_REFLECT_ANY_ORIGIN (Origin Reflected, acac=false) → HIGH', async () => {
    const out = await new CorsyJsonParser().parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.location === 'https://acme.tld/api2');
    expect(f).toMatchObject({ severity: 'HIGH', title: 'CORS_REFLECT_ANY_ORIGIN' });
  });

  it('maps CORS_PRE_DOMAIN_BYPASS (Pre-domain bypass) → HIGH', async () => {
    const out = await new CorsyJsonParser().parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.location === 'https://acme.tld/api3');
    expect(f).toMatchObject({ severity: 'HIGH', title: 'CORS_PRE_DOMAIN_BYPASS' });
  });

  it('maps CORS_THIRD_PARTY_ALLOWED (Third-Party Allowed) → MEDIUM', async () => {
    const out = await new CorsyJsonParser().parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.location === 'https://acme.tld/api4');
    expect(f).toMatchObject({ severity: 'MEDIUM', title: 'CORS_THIRD_PARTY_ALLOWED' });
  });

  it('maps CORS_HTTP_ALLOWED (HTTP Origin Allowed) → LOW', async () => {
    const out = await new CorsyJsonParser().parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.location === 'https://acme.tld/api5');
    expect(f).toMatchObject({ severity: 'LOW', title: 'CORS_HTTP_ALLOWED' });
  });

  it('drops unknown classes (no spurious INFO)', async () => {
    const out = await new CorsyJsonParser().parse(SAMPLE, ctx);
    expect(out.findings.find((x) => x.location === 'https://acme.tld/api6')).toBeUndefined();
  });

  it('handles malformed JSON without throwing', async () => {
    const out = await new CorsyJsonParser().parse('not-json', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
