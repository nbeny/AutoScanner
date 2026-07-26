import type { OsintSeedType } from './detect-seed-type';

export interface InvestigationFocus {
  seed: string;
  seedType: OsintSeedType;
}

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const localPart = (email: string) => email.split('@')[0] || email;
const domainPart = (email: string) => email.split('@')[1] ?? '';

/** Domain a focus is anchored to, if any (DOMAIN seed, or an email's domain). */
export function focusDomain(focus: InvestigationFocus): string | null {
  if (focus.seedType === 'DOMAIN') return focus.seed;
  if (focus.seedType === 'EMAIL') return domainPart(focus.seed);
  return null;
}

/**
 * Whether an Identity row belongs to the focused investigation. Identities keep
 * a `seed` field; for an EMAIL investigation maigret is seeded with the
 * local-part while holehe keeps the full address, so both match.
 */
export function identityMatchesFocus(
  focus: InvestigationFocus | null,
  identity: { seed: string },
): boolean {
  if (!focus) return true;
  if (focus.seedType === 'EMAIL') {
    return eq(identity.seed, focus.seed) || eq(identity.seed, localPart(focus.seed));
  }
  return eq(identity.seed, focus.seed);
}

/** Whether a discovered email belongs to the focused investigation. */
export function emailMatchesFocus(
  focus: InvestigationFocus | null,
  email: { address: string },
): boolean {
  if (!focus) return true;
  if (focus.seedType === 'EMAIL' && eq(email.address, focus.seed)) return true;
  const domain = focusDomain(focus);
  if (!domain) return false;
  return eq(domainPart(email.address), domain);
}

/** Whether an org-metadata row (with an optional `data.domain`) is in focus. */
export function orgMetaMatchesFocus(
  focus: InvestigationFocus | null,
  row: { data: unknown },
): boolean {
  if (!focus) return true;
  const domain = focusDomain(focus);
  if (!domain) return false;
  const rowDomain =
    row.data && typeof row.data === 'object'
      ? (row.data as Record<string, unknown>).domain
      : undefined;
  return typeof rowDomain === 'string' && eq(rowDomain, domain);
}
