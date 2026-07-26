import { describe, expect, it } from 'vitest';
import { computePhishingExposure } from '../phishing-exposure';

describe('computePhishingExposure', () => {
  it('returns nothing when no domain has a mail-auth weakness', () => {
    const org = [
      {
        data: {
          domain: 'corp.com',
          spf: { record: 'v=spf1 -all' },
          dmarc: { record: 'v=DMARC1; p=reject' },
        },
      },
    ];
    expect(computePhishingExposure([{ address: 'a@corp.com' }], org)).toEqual([]);
  });

  it('flags a spoofable domain with exposed emails as HIGH', () => {
    const org = [
      { data: { domain: 'corp.com', spf: {}, dmarc: { record: 'v=DMARC1', policy: 'none' } } },
    ];
    const emails = [{ address: 'admin@corp.com' }, { address: 'ceo@corp.com' }];

    const [exposure] = computePhishingExposure(emails, org);

    expect(exposure.domain).toBe('corp.com');
    expect(exposure.emailCount).toBe(2);
    expect(exposure.severity).toBe('HIGH');
    expect(exposure.weaknesses).toContain('SPF manquant');
    expect(exposure.weaknesses).toContain('DMARC p=none');
  });

  it('flags a spoofable domain without emails as MEDIUM', () => {
    const org = [
      {
        data: {
          domain: 'corp.com',
          spf: { record: '+all' },
          dmarc: { record: 'v=DMARC1; p=reject' },
        },
      },
    ];

    const [exposure] = computePhishingExposure([], org);

    expect(exposure.severity).toBe('MEDIUM');
    expect(exposure.emailCount).toBe(0);
    expect(exposure.weaknesses).toContain('SPF permissif');
  });

  it('ignores non-mail org metadata (no domain / no spf-dmarc keys)', () => {
    const org = [{ data: { registrant: 'Example Corp' } }, { data: 'not-an-object' }];
    expect(computePhishingExposure([{ address: 'a@corp.com' }], org)).toEqual([]);
  });

  it('sorts HIGH before MEDIUM', () => {
    const org = [
      { data: { domain: 'low.com', spf: {}, dmarc: { record: 'v=DMARC1; p=reject' } } },
      { data: { domain: 'high.com', spf: {}, dmarc: { record: 'v=DMARC1; p=reject' } } },
    ];
    const rows = computePhishingExposure([{ address: 'a@high.com' }], org);
    expect(rows.map((r) => r.domain)).toEqual(['high.com', 'low.com']);
  });
});
