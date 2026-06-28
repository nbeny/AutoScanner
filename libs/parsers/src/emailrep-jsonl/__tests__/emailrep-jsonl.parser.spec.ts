import { EmailrepJsonlParser } from '../emailrep-jsonl.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'emailrep',
  target: 'alice@acme.tld',
  engagementId: 'e',
};

describe('EmailrepJsonlParser', () => {
  const parser = new EmailrepJsonlParser();

  it('maps credentials_leaked=true → HIGH (EMAILREP_BREACHED)', async () => {
    const text = JSON.stringify({
      email: 'alice@acme.tld',
      details: { credentials_leaked: true, suspicious: false, data_breach: false },
    });
    const out = await parser.parse(text, ctx);
    const f = out.findings.find((x) => x.title === 'EMAILREP_BREACHED');
    expect(f).toMatchObject({
      scannerName: 'emailrep',
      severity: 'HIGH',
      location: 'alice@acme.tld',
    });
  });

  it('maps data_breach=true → HIGH (EMAILREP_DATA_BREACH)', async () => {
    const text = JSON.stringify({
      email: 'bob@acme.tld',
      details: { data_breach: true, credentials_leaked: false, suspicious: false },
    });
    const out = await parser.parse(text, ctx);
    const f = out.findings.find((x) => x.title === 'EMAILREP_DATA_BREACH');
    expect(f).toMatchObject({ severity: 'HIGH', location: 'bob@acme.tld' });
  });

  it('maps suspicious=true → MEDIUM (EMAILREP_SUSPICIOUS)', async () => {
    const text = JSON.stringify({
      email: 'carol@acme.tld',
      details: { suspicious: true, credentials_leaked: false, data_breach: false },
    });
    const out = await parser.parse(text, ctx);
    const f = out.findings.find((x) => x.title === 'EMAILREP_SUSPICIOUS');
    expect(f).toMatchObject({ severity: 'MEDIUM' });
  });

  it('maps reputation=low → LOW (EMAILREP_LOW_REPUTATION)', async () => {
    const text = JSON.stringify({
      email: 'dave@acme.tld',
      reputation: 'low',
      details: { suspicious: false, credentials_leaked: false, data_breach: false },
    });
    const out = await parser.parse(text, ctx);
    const f = out.findings.find((x) => x.title === 'EMAILREP_LOW_REPUTATION');
    expect(f).toMatchObject({ severity: 'LOW' });
  });

  it('emits no finding for a clean email', async () => {
    const text = JSON.stringify({
      email: 'clean@acme.tld',
      reputation: 'high',
      details: { suspicious: false, credentials_leaked: false, data_breach: false },
    });
    const out = await parser.parse(text, ctx);
    expect(out.findings).toHaveLength(0);
  });

  it('processes multiple JSONL lines', async () => {
    const text = [
      JSON.stringify({ email: 'a@x.tld', details: { credentials_leaked: true } }),
      JSON.stringify({ email: 'b@x.tld', details: { suspicious: true } }),
    ].join('\n');
    const out = await parser.parse(text, ctx);
    expect(out.findings).toHaveLength(2);
  });

  it('handles malformed lines without throwing', async () => {
    const out = await parser.parse('not-json\n{}', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
