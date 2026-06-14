import { SmtpReconScanner } from '../smtp-recon.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';
const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };
describe('SmtpReconScanner', () => {
  it('reuses the nmap image, XML → smtp-nmap-xml, produces Finding/OrgMetadata', () => {
    expect(SmtpReconScanner.name).toBe('smtp-recon');
    expect(SmtpReconScanner.docker.image).toBe('instrumentisto/nmap:7.98-r2');
    expect(SmtpReconScanner.outputs[0]).toEqual({
      format: 'XML',
      capture: 'stdout',
      parser: 'smtp-nmap-xml',
    });
    expect(SmtpReconScanner.produces).toEqual(expect.arrayContaining(['Finding', 'OrgMetadata']));
    expect(SmtpReconScanner.requiresCredential).toBeUndefined();
  });
  it('build() runs nmap smtp scripts on 25,465,587 with target as a direct arg (no shell)', () => {
    const { cmd } = SmtpReconScanner.build(
      SmtpReconScanner.inputSchema.parse({}),
      'mail.example.com',
      ctx,
    );
    expect(cmd[0]).toBe('nmap');
    expect(cmd).toContain('mail.example.com');
    expect(cmd.join(' ')).toContain('--script smtp-commands,smtp-open-relay,smtp-enum-users');
    expect(cmd.join(' ')).toContain('-p 25,465,587');
    expect(cmd).toContain('-oX');
  });
});
