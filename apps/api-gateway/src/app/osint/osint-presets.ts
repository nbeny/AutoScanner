/**
 * OSINT seed → scanner presets.
 *
 * Each seed type fans out to a curated set of key-free OSINT scanners (they run
 * without any API key configured). Every step is dispatched through the normal
 * `ScansService.runScan` path, so the scanners fall back to using `target` as
 * their seed — no per-scanner option wiring is needed beyond the optional
 * `target` transform (e.g. maigret searches the local-part of an email).
 */

export type OsintSeedType = 'EMAIL' | 'USERNAME' | 'PERSON' | 'DOMAIN';

export const OSINT_SEED_TYPES: readonly OsintSeedType[] = ['EMAIL', 'USERNAME', 'PERSON', 'DOMAIN'];

export interface OsintStep {
  scanner: string;
  /** Transform the seed into the scanner target. Defaults to identity. */
  target?: (seed: string) => string;
}

/** Local-part of an email (`alice@corp.com` → `alice`); passthrough otherwise. */
export const emailLocalPart = (seed: string): string => seed.split('@')[0] || seed;

export const OSINT_PRESETS: Record<OsintSeedType, OsintStep[]> = {
  EMAIL: [
    { scanner: 'holehe' },
    { scanner: 'emailrep' },
    { scanner: 'maigret', target: emailLocalPart },
  ],
  USERNAME: [{ scanner: 'maigret' }],
  PERSON: [{ scanner: 'maigret' }, { scanner: 'spiderfoot' }],
  DOMAIN: [
    { scanner: 'theharvester' },
    { scanner: 'emailfinder' },
    { scanner: 'whois' },
    { scanner: 'dnstwist' },
    { scanner: 'mailspoof' },
    { scanner: 'spoofy' },
    { scanner: 'spiderfoot' },
  ],
};
