import { SamlReconJsonParser } from '../saml-recon-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'saml-recon',
  target: 'https://sso.example.com',
  engagementId: 'e',
};

describe('SamlReconJsonParser', () => {
  const parser = new SamlReconJsonParser();

  it('maps probe findings to NormalizedFindings at the metadata URL', async () => {
    const report = JSON.stringify({
      metadataUrl: 'https://sso.example.com/saml/metadata',
      found: true,
      findings: [
        {
          id: 'sha1-signature',
          severity: 'MEDIUM',
          title: 'SAML metadata signed with SHA-1',
          detail: 'rsa-sha1',
        },
      ],
    });
    const out = await parser.parse(report, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      scannerName: 'saml-recon',
      title: 'SAML metadata signed with SHA-1',
      severity: 'MEDIUM',
      location: 'https://sso.example.com/saml/metadata',
    });
  });

  it('returns empty output when no metadata is found', async () => {
    const out = await parser.parse(
      JSON.stringify({ metadataUrl: null, found: false, findings: [] }),
      ctx,
    );
    expect(out.findings).toEqual([]);
  });

  it('returns empty output on empty/garbage input', async () => {
    expect((await parser.parse('', ctx)).findings).toEqual([]);
    expect((await parser.parse('not json', ctx)).findings).toEqual([]);
  });

  it('returns empty output when the JSON is null', async () => {
    const out = await parser.parse('null', ctx);
    expect(out.findings).toEqual([]);
  });

  it('clamps an unknown severity to INFO', async () => {
    const report = JSON.stringify({
      metadataUrl: 'u',
      findings: [{ title: 't', severity: 'ZZZ' }],
    });
    const out = await parser.parse(report, ctx);
    expect(out.findings[0].severity).toBe('INFO');
  });
});
