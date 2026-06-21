import { SshAuditScanner } from './ssh-audit.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j1', engagementId: 'e1', scratchDir: '/tmp' };

describe('SshAuditScanner', () => {
  it('declares identity, JSON/stdout output → ssh-audit-json parser, produces Finding', () => {
    expect(SshAuditScanner.name).toBe('ssh-audit');
    expect(SshAuditScanner.docker.image).toBe('autoscanner/ssh-audit:1.0');
    expect(SshAuditScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'ssh-audit-json',
    });
    expect(SshAuditScanner.produces).toContain('Finding');
    expect(SshAuditScanner.requiresCredential).toBeUndefined();
  });

  it('build() emits ssh-audit --json targeting port 22', () => {
    const { cmd } = SshAuditScanner.build(SshAuditScanner.inputSchema.parse({}), '10.0.0.1', ctx);
    expect(cmd).toEqual(['ssh-audit', '--json', '-p', '22', '10.0.0.1']);
  });

  it('build() respects custom port', () => {
    const { cmd } = SshAuditScanner.build(
      SshAuditScanner.inputSchema.parse({ port: 2222 }),
      '10.0.0.1',
      ctx,
    );
    expect(cmd).toContain('2222');
  });
});
