import { WebDastScanner } from '../web-dast.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx = (oast?: BuildContext['oast']): BuildContext => ({
  scanJobId: 'j',
  engagementId: 'e',
  scratchDir: '/tmp',
  oast,
});

describe('WebDastScanner.build', () => {
  const target = 'https://t.example/?id=1';

  it('detect mode: high+critical, in-band only when no OAST', () => {
    const { cmd, stdin } = WebDastScanner.build({ mode: 'detect' }, target, ctx());
    expect(cmd).toEqual(expect.arrayContaining(['nuclei', '-dast', '-jsonl', '-no-interactsh']));
    expect(cmd).toEqual(expect.arrayContaining(['-severity', 'high,critical']));
    expect(cmd).not.toEqual(expect.arrayContaining(['-interactsh-server']));
    expect(stdin).toBe(target);
  });

  it('aggressive mode: includes medium, higher rate', () => {
    const { cmd } = WebDastScanner.build({ mode: 'aggressive' }, target, ctx());
    expect(cmd).toEqual(expect.arrayContaining(['-severity', 'medium,high,critical']));
    expect(cmd).toEqual(expect.arrayContaining(['-rate-limit', '150']));
  });

  it('self-hosted OAST: wires -interactsh-server/-token, no -no-interactsh', () => {
    const { cmd } = WebDastScanner.build(
      { mode: 'detect' },
      target,
      ctx({ serverUrl: 'https://oast.example.com', token: 'tok' }),
    );
    expect(cmd).toEqual(expect.arrayContaining(['-interactsh-server', 'https://oast.example.com']));
    expect(cmd).toEqual(expect.arrayContaining(['-interactsh-token', 'tok']));
    expect(cmd).not.toContain('-no-interactsh');
  });

  it('public OAST opt-in: neither -no-interactsh nor -interactsh-server (nuclei default)', () => {
    const { cmd } = WebDastScanner.build({ mode: 'detect' }, target, ctx({ allowPublic: true }));
    expect(cmd).not.toContain('-no-interactsh');
    expect(cmd).not.toContain('-interactsh-server');
  });

  it('quotes nothing into a shell — target travels via stdin', () => {
    const { cmd } = WebDastScanner.build({ mode: 'detect' }, "x'; rm -rf /", ctx());
    expect(cmd).not.toContain('sh');
  });

  it('attaches session headers (-H) for authenticated fuzzing', () => {
    const { cmd } = WebDastScanner.build({ mode: 'detect' }, target, {
      ...ctx(),
      auth: { cookie: 'session=abc', headers: { Authorization: 'Bearer xyz' } },
    });
    expect(cmd).toEqual(expect.arrayContaining(['-H', 'Cookie: session=abc']));
    expect(cmd).toEqual(expect.arrayContaining(['-H', 'Authorization: Bearer xyz']));
  });
});
