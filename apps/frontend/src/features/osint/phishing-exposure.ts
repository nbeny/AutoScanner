export interface EmailLike {
  address: string;
}

export interface OrgMetaLike {
  data: unknown;
}

export interface FindingLike {
  title: string;
  location?: string | null;
}

export interface PhishingExposure {
  domain: string;
  emailCount: number;
  weaknesses: string[];
  severity: 'HIGH' | 'MEDIUM';
}

interface MailAuthData {
  domain?: string;
  spf?: { record?: string | null; issues?: string[] };
  dmarc?: { record?: string | null; policy?: string };
  dkim?: { present?: boolean };
}

/** mailspoof / spoofy finding titles → the weakness label they represent. */
const FINDING_WEAKNESS: Record<string, string> = {
  MAILSPOOF_SPF_MISSING: 'SPF manquant',
  MAILSPOOF_SPF_PERMISSIVE: 'SPF permissif',
  MAILSPOOF_DMARC_MISSING: 'DMARC manquant',
  MAILSPOOF_DMARC_NONE: 'DMARC p=none',
  MAILSPOOF_DKIM_MISSING: 'DKIM manquant',
  SPOOFY_SPF_SPOOFABLE: 'SPF spoofable',
  SPOOFY_DMARC_SPOOFABLE: 'DMARC spoofable',
  SPOOFY_SPOOFABLE: 'Domaine spoofable',
};

/** Mail-authentication weaknesses in a mailspoof-shaped org-metadata blob. */
function weaknessesOf(data: MailAuthData): string[] {
  const w: string[] = [];
  if (!data.spf?.record) w.push('SPF manquant');
  else if (data.spf.issues?.includes('too-permissive') || data.spf.record.includes('+all'))
    w.push('SPF permissif');
  if (!data.dmarc?.record) w.push('DMARC manquant');
  else if ((data.dmarc.policy ?? '').toLowerCase() === 'none') w.push('DMARC p=none');
  if (data.dkim?.present === false) w.push('DKIM manquant');
  return w;
}

const domainOf = (address: string) => (address.split('@')[1] ?? '').toLowerCase();

/**
 * Correlate discovered emails (OSINT exposure) with weak mail authentication
 * to surface per-domain phishing risk. The spoofability signal is drawn from
 * two sources: mailspoof org-metadata (SPF/DMARC/DKIM detail) and mailspoof /
 * spoofy findings (whose `location` is the domain) — so spoofy's spoofable
 * verdict is captured too. A domain is reported when it has ≥1 weakness;
 * severity is HIGH when exposed emails exist for it, MEDIUM otherwise.
 */
export function computePhishingExposure(
  emails: EmailLike[],
  orgMetadata: OrgMetaLike[],
  findings: FindingLike[] = [],
): PhishingExposure[] {
  const emailCountByDomain = new Map<string, number>();
  for (const e of emails) {
    const d = domainOf(e.address);
    if (d) emailCountByDomain.set(d, (emailCountByDomain.get(d) ?? 0) + 1);
  }

  const weaknessesByDomain = new Map<string, Set<string>>();
  const addWeakness = (domain: string, label: string) => {
    const key = domain.toLowerCase();
    const set = weaknessesByDomain.get(key) ?? new Set<string>();
    set.add(label);
    weaknessesByDomain.set(key, set);
  };

  for (const row of orgMetadata) {
    if (!row.data || typeof row.data !== 'object') continue;
    const data = row.data as MailAuthData;
    if (typeof data.domain !== 'string') continue;
    for (const label of weaknessesOf(data)) addWeakness(data.domain, label);
  }

  for (const f of findings) {
    const label = FINDING_WEAKNESS[f.title];
    if (label && f.location) addWeakness(f.location, label);
  }

  const results: PhishingExposure[] = [];
  for (const [domain, set] of weaknessesByDomain) {
    const emailCount = emailCountByDomain.get(domain) ?? 0;
    results.push({
      domain,
      emailCount,
      weaknesses: Array.from(set),
      severity: emailCount > 0 ? 'HIGH' : 'MEDIUM',
    });
  }

  return results.sort(
    (a, b) =>
      Number(b.severity === 'HIGH') - Number(a.severity === 'HIGH') || b.emailCount - a.emailCount,
  );
}
