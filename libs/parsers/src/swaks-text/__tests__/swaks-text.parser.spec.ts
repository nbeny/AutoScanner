import { SwaksTextParser } from '../swaks-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'swaks',
  target: 'mail.acme.tld',
  engagementId: 'e',
};

const SAMPLE_GOOD = [
  '<-  220 mail.acme.tld ESMTP Postfix (Debian/GNU)',
  ' -> EHLO host.example.org',
  '<-  250-mail.acme.tld',
  '<-  250-PIPELINING',
  '<-  250-SIZE 10240000',
  '<-  250-STARTTLS',
  '<-  250-AUTH LOGIN PLAIN',
  '<-  250 SMTPUTF8',
  ' -> STARTTLS',
  '<-  220 2.0.0 Ready to start TLS',
  '=== TLS started with cipher TLSv1.3:TLS_AES_256_GCM_SHA384:256',
  ' -> EHLO host.example.org',
  '<-  250 OK',
  ' -> QUIT',
].join('\n');

const SAMPLE_AUTH_PLAIN_NO_TLS = [
  '<-  220 weak.example ESMTP',
  ' -> EHLO host.example.org',
  '<-  250-weak.example',
  '<-  250-AUTH LOGIN PLAIN',
  '<-  250 OK',
  ' -> QUIT',
].join('\n');

const SAMPLE_NO_STARTTLS = [
  '<-  220 nostart.example ESMTP',
  ' -> EHLO host.example.org',
  '<-  250-nostart.example',
  '<-  250 OK',
  ' -> QUIT',
].join('\n');

const SAMPLE_WEAK_TLS = [
  '<-  220 oldtls.example ESMTP',
  ' -> EHLO host.example.org',
  '<-  250-oldtls.example',
  '<-  250-STARTTLS',
  ' -> STARTTLS',
  '<-  220 Ready',
  '=== TLS started with cipher TLSv1.0:AES128-SHA:128',
].join('\n');

const SAMPLE_VERSION_BANNER = [
  '<-  220 leaky.example ESMTP Postfix 3.4.13-1ubuntu1 Ubuntu',
  ' -> EHLO host.example.org',
  '<-  250 OK',
].join('\n');

describe('SwaksTextParser', () => {
  const parser = new SwaksTextParser();

  it('emits OrgMetadata with banner + auth methods + starttls + tls version', async () => {
    const out = await parser.parse(SAMPLE_GOOD, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    const data = out.orgMetadata[0].data as Record<string, unknown>;
    expect(data['banner']).toContain('Postfix');
    expect(data['authMethods']).toEqual(['LOGIN', 'PLAIN']);
    expect(data['starttlsOffered']).toBe(true);
    expect(data['tlsVersion']).toBe('TLSv1.3');
  });

  it('emits no Finding on a healthy STARTTLS + TLS1.3 transcript', async () => {
    const out = await parser.parse(SAMPLE_GOOD, ctx);
    expect(out.findings).toHaveLength(0);
  });

  it('maps AUTH PLAIN without TLS → SWAKS_AUTH_PLAIN_NO_TLS / HIGH', async () => {
    const out = await parser.parse(SAMPLE_AUTH_PLAIN_NO_TLS, ctx);
    const f = out.findings.find((x) => x.title === 'SWAKS_AUTH_PLAIN_NO_TLS');
    expect(f?.severity).toBe('HIGH');
  });

  it('maps missing STARTTLS → SWAKS_STARTTLS_MISSING / MEDIUM', async () => {
    const out = await parser.parse(SAMPLE_NO_STARTTLS, ctx);
    const f = out.findings.find((x) => x.title === 'SWAKS_STARTTLS_MISSING');
    expect(f?.severity).toBe('MEDIUM');
  });

  it('maps TLS < 1.2 → SWAKS_WEAK_TLS / MEDIUM', async () => {
    const out = await parser.parse(SAMPLE_WEAK_TLS, ctx);
    const f = out.findings.find((x) => x.title === 'SWAKS_WEAK_TLS');
    expect(f?.severity).toBe('MEDIUM');
  });

  it('maps version-string banner leak → SWAKS_BANNER_VERSION_LEAK / LOW', async () => {
    const out = await parser.parse(SAMPLE_VERSION_BANNER, ctx);
    const f = out.findings.find((x) => x.title === 'SWAKS_BANNER_VERSION_LEAK');
    expect(f?.severity).toBe('LOW');
  });

  it('returns empty output on empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.orgMetadata).toHaveLength(0);
    expect(out.findings).toHaveLength(0);
  });
});
