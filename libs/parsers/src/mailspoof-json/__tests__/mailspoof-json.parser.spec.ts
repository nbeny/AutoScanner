import { MailspoofJsonParser } from '../mailspoof-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'mailspoof',
  target: 'acme.tld',
  engagementId: 'e',
};

const SAMPLE_GOOD = JSON.stringify({
  domain: 'acme.tld',
  spf: { record: 'v=spf1 include:_spf.acme.tld -all', issues: [] },
  dmarc: {
    record: 'v=DMARC1; p=reject; rua=mailto:dmarc@acme.tld',
    policy: 'reject',
    rua: 'mailto:dmarc@acme.tld',
  },
  dkim: { selectors: ['s1'], present: true },
});

const SAMPLE_NO_SPF = JSON.stringify({
  domain: 'noSpf.example',
  spf: { record: null, issues: ['missing'] },
  dmarc: { record: 'v=DMARC1; p=reject', policy: 'reject' },
  dkim: { present: true },
});

const SAMPLE_PERMISSIVE_SPF = JSON.stringify({
  domain: 'permissive.example',
  spf: { record: 'v=spf1 +all', issues: ['too-permissive'] },
  dmarc: { record: 'v=DMARC1; p=reject', policy: 'reject' },
  dkim: { present: true },
});

const SAMPLE_NO_DMARC = JSON.stringify({
  domain: 'noDmarc.example',
  spf: { record: 'v=spf1 -all' },
  dmarc: { record: null },
  dkim: { present: true },
});

const SAMPLE_DMARC_NONE = JSON.stringify({
  domain: 'pnone.example',
  spf: { record: 'v=spf1 -all' },
  dmarc: { record: 'v=DMARC1; p=none', policy: 'none' },
  dkim: { present: true },
});

const SAMPLE_NO_DKIM = JSON.stringify({
  domain: 'noDkim.example',
  spf: { record: 'v=spf1 -all' },
  dmarc: { record: 'v=DMARC1; p=reject; rua=mailto:x@y' },
  dkim: { present: false },
});

describe('MailspoofJsonParser', () => {
  const parser = new MailspoofJsonParser();

  it('emits a single OrgMetadata holding the full payload', async () => {
    const out = await parser.parse(SAMPLE_GOOD, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    expect(out.orgMetadata[0].kind).toBe('OTHER');
  });

  it('emits no Finding when SPF + DMARC reject + DKIM present', async () => {
    const out = await parser.parse(SAMPLE_GOOD, ctx);
    expect(out.findings).toHaveLength(0);
  });

  it('maps missing SPF → MAILSPOOF_SPF_MISSING / LOW', async () => {
    const out = await parser.parse(SAMPLE_NO_SPF, ctx);
    const f = out.findings.find((x) => x.title === 'MAILSPOOF_SPF_MISSING');
    expect(f).toMatchObject({
      scannerName: 'mailspoof',
      severity: 'LOW',
      location: 'noSpf.example',
    });
  });

  it('maps too-permissive SPF (+all) → MAILSPOOF_SPF_PERMISSIVE / MEDIUM', async () => {
    const out = await parser.parse(SAMPLE_PERMISSIVE_SPF, ctx);
    const f = out.findings.find((x) => x.title === 'MAILSPOOF_SPF_PERMISSIVE');
    expect(f).toMatchObject({ severity: 'MEDIUM', location: 'permissive.example' });
  });

  it('maps missing DMARC → MAILSPOOF_DMARC_MISSING / LOW', async () => {
    const out = await parser.parse(SAMPLE_NO_DMARC, ctx);
    const f = out.findings.find((x) => x.title === 'MAILSPOOF_DMARC_MISSING');
    expect(f).toMatchObject({ severity: 'LOW', location: 'noDmarc.example' });
  });

  it('maps DMARC p=none → MAILSPOOF_DMARC_NONE / MEDIUM', async () => {
    const out = await parser.parse(SAMPLE_DMARC_NONE, ctx);
    const f = out.findings.find((x) => x.title === 'MAILSPOOF_DMARC_NONE');
    expect(f).toMatchObject({ severity: 'MEDIUM', location: 'pnone.example' });
  });

  it('maps DKIM absent → MAILSPOOF_DKIM_MISSING / LOW', async () => {
    const out = await parser.parse(SAMPLE_NO_DKIM, ctx);
    const f = out.findings.find((x) => x.title === 'MAILSPOOF_DKIM_MISSING');
    expect(f).toMatchObject({ severity: 'LOW', location: 'noDkim.example' });
  });

  it('handles malformed JSON without throwing', async () => {
    expect((await parser.parse('not-json', ctx)).findings).toHaveLength(0);
  });
});
