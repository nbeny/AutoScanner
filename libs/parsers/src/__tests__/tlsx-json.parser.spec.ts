import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TlsxJsonParser } from '../tlsx-json/tlsx-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'tlsx-sample.jsonl'), 'utf8');

const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'tlsx',
  target: 'example.com',
  engagementId: 'eng_1',
};

describe('TlsxJsonParser', () => {
  const parser = new TlsxJsonParser();

  it('declares name and supported formats', () => {
    expect(parser.name).toBe('tlsx-json');
    expect(parser.formats).toEqual(['JSONL']);
  });

  it('emits exactly one tlsCertificate from the fixture', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.tlsCertificates).toHaveLength(1);
  });

  it('maps all certificate fields correctly', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const cert = out.tlsCertificates[0];
    expect(cert.host).toBe('example.com');
    expect(cert.subjectCn).toBe('example.com');
    expect(cert.subjectAn).toEqual(['example.com', 'www.example.com']);
    expect(cert.subjectAn).toHaveLength(2);
    expect(cert.issuerCn).toBe('DigiCert TLS RSA SHA256');
    expect(cert.notBefore).toBe('2023-01-01T00:00:00Z');
    expect(cert.notAfter).toBe('2024-01-01T00:00:00Z');
    expect(cert.fingerprintSha256).toBe('abc123def456');
    expect(cert.tlsVersion).toBe('tls10');
    expect(cert.selfSigned).toBe(true);
    expect(cert.expired).toBe(true);
  });

  it('emits exactly 3 findings for the fixture (expired + self-signed + weak TLS version)', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.findings).toHaveLength(3);

    const titles = out.findings.map((f) => f.title);
    expect(titles).toContain('Expired TLS certificate');
    expect(titles).toContain('Self-signed TLS certificate');
    expect(titles).toContain('Weak TLS version: tls10');
  });

  it('sets correct severities on findings', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const expired = out.findings.find((f) => f.title === 'Expired TLS certificate');
    const selfSigned = out.findings.find((f) => f.title === 'Self-signed TLS certificate');
    const weakTls = out.findings.find((f) => f.title === 'Weak TLS version: tls10');

    expect(expired?.severity).toBe('MEDIUM');
    expect(selfSigned?.severity).toBe('LOW');
    expect(weakTls?.severity).toBe('MEDIUM');
  });

  it('sets location to a URL-form host on all findings (parseable by the worker)', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    for (const finding of out.findings) {
      // URL-form so parse-job-worker's `new URL(location).hostname` resolves it.
      expect(finding.location).toBe('https://example.com');
      expect(finding.scannerName).toBe('tlsx');
    }
  });

  it('skips malformed JSON lines without throwing', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    // malformed line + no-fingerprint line are both skipped
    expect(out.tlsCertificates).toHaveLength(1);
  });

  it('skips records without fingerprint_hash.sha256 without throwing', async () => {
    const input = '{"host":"no-fp.example.com","port":"443"}';
    const out = await parser.parse(input, ctx);
    expect(out.tlsCertificates).toHaveLength(0);
    expect(out.findings).toHaveLength(0);
  });

  it('skips records without host without throwing', async () => {
    const input = '{"port":"443","fingerprint_hash":{"sha256":"aabbcc"}}';
    const out = await parser.parse(input, ctx);
    expect(out.tlsCertificates).toHaveLength(0);
  });

  it('accepts Buffer input', async () => {
    const out = await parser.parse(Buffer.from(FIXTURE, 'utf8'), ctx);
    expect(out.tlsCertificates).toHaveLength(1);
    expect(out.findings).toHaveLength(3);
  });

  it('returns empty NormalizedOutput for empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.tlsCertificates).toEqual([]);
    expect(out.findings).toEqual([]);
  });

  it('does not emit weak-tls finding for strong TLS versions', async () => {
    const input = JSON.stringify({
      host: 'secure.example.com',
      fingerprint_hash: { sha256: 'aabbcc' },
      tls_version: 'tls13',
    });
    const out = await parser.parse(input, ctx);
    expect(out.tlsCertificates).toHaveLength(1);
    expect(out.findings).toHaveLength(0);
  });
});
