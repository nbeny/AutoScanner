import { SamlReconScanner } from '../saml-recon.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('SamlReconScanner', () => {
  it('declares name, image, JSON file → saml-recon-json, produces Finding', () => {
    expect(SamlReconScanner.name).toBe('saml-recon');
    expect(SamlReconScanner.docker.image).toBe('autoscanner/saml-recon:1.0');
    expect(SamlReconScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/out/result.json' },
      parser: 'saml-recon-json',
    });
    expect(SamlReconScanner.produces).toEqual(['Finding']);
  });

  it('build() runs saml-probe against the target', () => {
    const input = SamlReconScanner.inputSchema.parse({});
    const { cmd } = SamlReconScanner.build(input, 'https://sso.example.com', ctx);
    expect(cmd[2]).toContain('saml-probe');
    expect(cmd[2]).toContain("'https://sso.example.com'");
    expect(cmd[2]).toContain('/out/result.json');
  });

  it('build() passes an explicit metadataUrl through', () => {
    const input = SamlReconScanner.inputSchema.parse({
      metadataUrl: 'https://sso.example.com/saml/metadata',
    });
    const { cmd } = SamlReconScanner.build(input, 'https://sso.example.com', ctx);
    expect(cmd[2]).toContain("'https://sso.example.com/saml/metadata'");
  });

  it('rejects a non-URL metadataUrl', () => {
    expect(() => SamlReconScanner.inputSchema.parse({ metadataUrl: 'nope' })).toThrow();
  });
});
