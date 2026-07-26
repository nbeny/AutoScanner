export type OsintSeedType = 'EMAIL' | 'USERNAME' | 'PERSON' | 'DOMAIN';

export const OSINT_SEED_TYPES: readonly OsintSeedType[] = ['EMAIL', 'USERNAME', 'PERSON', 'DOMAIN'];

export const SEED_TYPE_LABEL: Record<OsintSeedType, string> = {
  EMAIL: 'Email',
  USERNAME: 'Username',
  PERSON: 'Personne',
  DOMAIN: 'Domaine',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;

/**
 * Best-effort classification of a raw OSINT seed. The operator can always
 * override the result via the seed-type selector.
 *
 * - `alice@corp.com` → EMAIL
 * - `corp.com`       → DOMAIN
 * - `John Doe`       → PERSON (contains whitespace)
 * - `neo`            → USERNAME (single bare token)
 */
export function detectSeedType(raw: string): OsintSeedType {
  const seed = raw.trim();
  if (!seed) return 'USERNAME';
  if (EMAIL_RE.test(seed)) return 'EMAIL';
  if (/\s/.test(seed)) return 'PERSON';
  if (DOMAIN_RE.test(seed)) return 'DOMAIN';
  return 'USERNAME';
}
