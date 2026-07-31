import { EmailSurfaceRecon } from '../email-surface-recon';
import { BUILTIN_TEMPLATES } from '../index';

describe('EmailSurfaceRecon template', () => {
  it('appears in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toContain('email-surface-recon');
  });

  it('chains 6 steps in expected order', () => {
    expect(EmailSurfaceRecon.steps.map((s) => s.scannerName)).toEqual([
      'mailspoof',
      'spoofy',
      'swaks',
      'emailfinder',
      'emailrep',
      'h8mail',
    ]);
  });

  it('mailspoof / spoofy / swaks / emailfinder all target the engagement root', () => {
    for (const name of ['mailspoof', 'spoofy', 'swaks', 'emailfinder']) {
      const step = EmailSurfaceRecon.steps.find((s) => s.scannerName === name);
      expect(step?.target).toEqual({ kind: 'context', path: 'target' });
    }
  });

  it('emailrep consumes the emails context', () => {
    const step = EmailSurfaceRecon.steps.find((s) => s.scannerName === 'emailrep');
    expect(step?.target).toEqual({ kind: 'context', path: 'emails' });
  });

  it('h8mail consumes the emails context for breach checking', () => {
    const step = EmailSurfaceRecon.steps.find((s) => s.scannerName === 'h8mail');
    expect(step?.target).toEqual({ kind: 'context', path: 'emails' });
    expect(step?.inputs).toEqual({});
  });

  it('swaks step is gated by active-mail-probe capability', () => {
    const step = EmailSurfaceRecon.steps.find((s) => s.scannerName === 'swaks');
    expect(step?.requiresCapability).toBe('active-mail-probe');
  });

  it('exposes a scope-acknowledgement banner about active SMTP probing', () => {
    expect(EmailSurfaceRecon.scopeAcknowledgement).toMatch(/swaks|smtp/i);
  });
});
