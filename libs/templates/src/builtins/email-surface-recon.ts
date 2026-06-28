import type { TemplateDefinition } from '../types';

/**
 * Phase 14B — Email / mail surface intelligence.
 *
 * Chain: mailspoof → spoofy → swaks (gated) → emailfinder → emailrep.
 *
 * - mailspoof + spoofy run in parallel (both passive, both target the
 *   engagement root) — mailspoof emits granular per-record findings,
 *   spoofy emits the synthesized spoofability verdict. Operators read
 *   both.
 * - swaks is the only active step. The template engine skips it for
 *   operators lacking the `active-mail-probe` capability — there is no
 *   way to opt into an SMTP handshake without the explicit grant.
 * - emailfinder runs after the SMTP probes, harvesting email addresses
 *   into the engagement Email table.
 * - emailrep consumes the merged email set (theharvester/spiderfoot/
 *   whois already contribute; emailfinder adds to it just before) via
 *   ContextBuilder.path: 'emails'.
 */
export const EmailSurfaceRecon: TemplateDefinition = {
  name: 'email-surface-recon',
  displayName: 'Email Surface Recon',
  description:
    'Email/mail surface recon: mailspoof + spoofy DMARC analysis → swaks SMTP probe ' +
    '(gated) → emailfinder harvest → emailrep reputation lookup per address.',
  scopeAcknowledgement:
    'swaks runs a live SMTP handshake (banner, AUTH offers, STARTTLS) against the ' +
    'engagement target. The step is gated by the `active-mail-probe` capability and ' +
    'skipped without it. Verify the engagement explicitly allows SMTP probing.',
  steps: [
    { scannerName: 'mailspoof', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'spoofy', inputs: {}, target: { kind: 'context', path: 'target' } },
    {
      scannerName: 'swaks',
      inputs: {},
      target: { kind: 'context', path: 'target' },
      requiresCapability: 'active-mail-probe',
    },
    { scannerName: 'emailfinder', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'emailrep', inputs: {}, target: { kind: 'context', path: 'emails' } },
  ],
};
