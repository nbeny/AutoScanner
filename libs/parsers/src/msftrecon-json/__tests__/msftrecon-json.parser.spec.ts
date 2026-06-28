import { MsftreconJsonParser } from '../msftrecon-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'msftrecon',
  target: 'contoso.com',
  engagementId: 'e',
};

const SAMPLE_FULL = JSON.stringify({
  domain: 'contoso.com',
  tenantId: '00000000-0000-0000-0000-000000000001',
  tenantName: 'Contoso Ltd',
  federationBrandName: 'Contoso',
  nameSpaceType: 'Managed',
  spf: 'v=spf1 include:spf.protection.outlook.com -all',
  dkim: { selector1: true, selector2: true },
  mtaSts: { policy: 'enforce', mode: 'enforce' },
  mxRecords: ['contoso-com.mail.protection.outlook.com'],
});

const SAMPLE_NO_SPF = JSON.stringify({
  domain: 'noSpf.example',
  tenantId: '00000000-0000-0000-0000-000000000002',
  spf: null,
  dkim: { selector1: true },
  nameSpaceType: 'Managed',
});

const SAMPLE_NO_DKIM = JSON.stringify({
  domain: 'noDkim.example',
  spf: 'v=spf1 -all',
  dkim: { selector1: false, selector2: false },
  nameSpaceType: 'Managed',
});

const SAMPLE_FEDERATED = JSON.stringify({
  domain: 'fed.example',
  spf: 'v=spf1 -all',
  dkim: { selector1: true },
  nameSpaceType: 'Federated',
  federationProtocol: 'WSFederation',
});

describe('MsftreconJsonParser', () => {
  const parser = new MsftreconJsonParser();

  it('emits a single OrgMetadata with the full payload', async () => {
    const out = await parser.parse(SAMPLE_FULL, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    expect(out.orgMetadata[0].kind).toBe('OTHER');
    const data = out.orgMetadata[0].data as Record<string, unknown>;
    expect(data['tenantId']).toBe('00000000-0000-0000-0000-000000000001');
    expect(data['tenantName']).toBe('Contoso Ltd');
  });

  it('emits no Finding when SPF + DKIM + Managed federation are all good', async () => {
    const out = await parser.parse(SAMPLE_FULL, ctx);
    expect(out.findings).toHaveLength(0);
  });

  it('emits LOW Finding when SPF is missing', async () => {
    const out = await parser.parse(SAMPLE_NO_SPF, ctx);
    const f = out.findings.find((x) => x.title === 'MSFTRECON_SPF_MISSING');
    expect(f).toMatchObject({
      scannerName: 'msftrecon',
      severity: 'LOW',
      location: 'noSpf.example',
    });
  });

  it('emits LOW Finding when DKIM has no enabled selector', async () => {
    const out = await parser.parse(SAMPLE_NO_DKIM, ctx);
    const f = out.findings.find((x) => x.title === 'MSFTRECON_DKIM_MISSING');
    expect(f).toMatchObject({
      scannerName: 'msftrecon',
      severity: 'LOW',
      location: 'noDkim.example',
    });
  });

  it('emits MEDIUM Finding on Federated namespace with WSFederation protocol', async () => {
    const out = await parser.parse(SAMPLE_FEDERATED, ctx);
    const f = out.findings.find((x) => x.title === 'MSFTRECON_LEGACY_FEDERATION');
    expect(f).toMatchObject({
      scannerName: 'msftrecon',
      severity: 'MEDIUM',
      location: 'fed.example',
    });
  });

  it('handles malformed JSON without throwing', async () => {
    const out = await parser.parse('not-json', ctx);
    expect(out.orgMetadata).toHaveLength(0);
    expect(out.findings).toHaveLength(0);
  });

  it('returns empty output on empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.orgMetadata).toHaveLength(0);
    expect(out.findings).toHaveLength(0);
  });
});
