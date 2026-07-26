import { computePhishingExposure } from '../phishing-exposure';

describe('computePhishingExposure (reporting)', () => {
  it('flags a spoofable domain with exposed emails as HIGH', () => {
    const org = [
      { data: { domain: 'corp.com', spf: {}, dmarc: { record: 'v=DMARC1', policy: 'none' } } },
    ];
    const [x] = computePhishingExposure(
      [{ address: 'admin@corp.com' }, { address: 'ceo@corp.com' }],
      org,
    );
    expect(x.domain).toBe('corp.com');
    expect(x.emailCount).toBe(2);
    expect(x.severity).toBe('HIGH');
    expect(x.weaknesses).toEqual(expect.arrayContaining(['SPF manquant', 'DMARC p=none']));
  });

  it('captures spoofy findings by domain and dedupes weaknesses', () => {
    const org = [
      { data: { domain: 'corp.com', spf: {}, dmarc: { record: 'ok', policy: 'reject' } } },
    ];
    const findings = [
      { title: 'MAILSPOOF_SPF_MISSING', location: 'corp.com' },
      { title: 'SPOOFY_SPOOFABLE', location: 'corp.com' },
    ];
    const [x] = computePhishingExposure([], org, findings);
    expect(x.weaknesses.filter((w) => w === 'SPF manquant')).toHaveLength(1);
    expect(x.weaknesses).toContain('Domaine spoofable');
    expect(x.severity).toBe('MEDIUM');
  });

  it('ignores non-mail org metadata and unrelated findings', () => {
    expect(
      computePhishingExposure(
        [{ address: 'a@corp.com' }],
        [{ data: { registrant: 'X' } }],
        [{ title: 'OTHER', location: 'corp.com' }],
      ),
    ).toEqual([]);
  });
});
