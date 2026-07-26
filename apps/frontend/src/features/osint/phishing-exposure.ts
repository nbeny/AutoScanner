export interface EmailLike {
  address: string;
}

export interface OrgMetaLike {
  data: unknown;
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
 * (mailspoof DNS surface) to surface per-domain phishing risk. A domain is
 * reported when it has at least one mail-auth weakness; severity is HIGH when
 * exposed emails exist for that domain (spoofable *and* a target list), MEDIUM
 * otherwise.
 */
export function computePhishingExposure(
  emails: EmailLike[],
  orgMetadata: OrgMetaLike[],
): PhishingExposure[] {
  const emailCountByDomain = new Map<string, number>();
  for (const e of emails) {
    const d = domainOf(e.address);
    if (d) emailCountByDomain.set(d, (emailCountByDomain.get(d) ?? 0) + 1);
  }

  const byDomain = new Map<string, PhishingExposure>();
  for (const row of orgMetadata) {
    if (!row.data || typeof row.data !== 'object') continue;
    const data = row.data as MailAuthData;
    if (typeof data.domain !== 'string') continue;
    const weaknesses = weaknessesOf(data);
    if (weaknesses.length === 0) continue;

    const domain = data.domain.toLowerCase();
    const emailCount = emailCountByDomain.get(domain) ?? 0;
    const existing = byDomain.get(domain);
    const merged = existing
      ? Array.from(new Set([...existing.weaknesses, ...weaknesses]))
      : weaknesses;
    byDomain.set(domain, {
      domain,
      emailCount,
      weaknesses: merged,
      severity: emailCount > 0 ? 'HIGH' : 'MEDIUM',
    });
  }

  return Array.from(byDomain.values()).sort(
    (a, b) =>
      Number(b.severity === 'HIGH') - Number(a.severity === 'HIGH') || b.emailCount - a.emailCount,
  );
}
