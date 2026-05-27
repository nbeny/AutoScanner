import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NucleiJsonParser } from '../nuclei-json/nuclei-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'nuclei-example.jsonl'), 'utf8');

const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'nuclei',
  target: 'https://api.example.com',
  engagementId: 'eng_1',
};

describe('NucleiJsonParser', () => {
  const parser = new NucleiJsonParser();

  it('declares name and supported formats', () => {
    expect(parser.name).toBe('nuclei-json');
    expect(parser.formats).toEqual(['JSONL']);
  });

  it('emits one finding per valid JSONL line', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    // 5 well-formed JSON lines in the fixture (the 4th is malformed JSON).
    // The 5th line has no info block — it should still be skipped (no title).
    // The 6th line has info.name and no severity — it should still be skipped
    // (severity is required by NormalizedFinding).
    // → 3 valid findings: CVE-2021-44228, exposed-panel-grafana, missing-host-header
    expect(out.findings.length).toBe(3);
  });

  it('maps title from info.name', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const titles = out.findings.map((f) => f.title);
    expect(titles).toContain('Apache Log4j RCE');
    expect(titles).toContain('Grafana Login Panel');
    expect(titles).toContain('Missing CSP Header');
  });

  it('uppercases severity (critical → CRITICAL, info → INFO, LOW → LOW)', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const sevs = out.findings.map((f) => f.severity);
    expect(sevs).toEqual(expect.arrayContaining(['CRITICAL', 'INFO', 'LOW']));
    for (const s of sevs) {
      expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).toContain(s);
    }
  });

  it('maps templateId from template-id', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const log4j = out.findings.find((f) => f.title === 'Apache Log4j RCE');
    expect(log4j?.templateId).toBe('CVE-2021-44228');
  });

  it('maps location from matched-at', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const log4j = out.findings.find((f) => f.title === 'Apache Log4j RCE');
    expect(log4j?.location).toBe('https://api.example.com/login');
  });

  it('extracts cveId from info.classification.cve-id[0]', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const log4j = out.findings.find((f) => f.title === 'Apache Log4j RCE');
    expect(log4j?.cveId).toBe('CVE-2021-44228');
    // The exposed-panel-grafana finding has no classification — cveId undefined.
    const panel = out.findings.find((f) => f.title === 'Grafana Login Panel');
    expect(panel?.cveId).toBeUndefined();
  });

  it('attaches evidence with request, response, and extracted-results', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const log4j = out.findings.find((f) => f.title === 'Apache Log4j RCE');
    const ev = log4j?.evidence as Record<string, unknown>;
    expect(ev).toBeDefined();
    expect(ev['request']).toContain('GET /login');
    expect(ev['response']).toContain('200 OK');
    expect(ev['extracted-results']).toEqual(['sn4xkdh4j2']);
  });

  it('sets scannerName to "nuclei" on every finding', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    for (const f of out.findings) {
      expect(f.scannerName).toBe('nuclei');
    }
  });

  it('skips malformed JSON lines without throwing', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    // Fixture has a `not-valid-json` line; finding count must still be 3.
    expect(out.findings.length).toBe(3);
  });

  it('skips lines without info.name (no title to anchor the finding)', async () => {
    const input = '{"template-id":"no-info"}';
    const out = await parser.parse(input, ctx);
    expect(out.findings.length).toBe(0);
  });

  it('skips lines without info.severity', async () => {
    const input = JSON.stringify({
      'template-id': 'no-sev',
      info: { name: 'Some Finding' },
    });
    const out = await parser.parse(input, ctx);
    expect(out.findings.length).toBe(0);
  });

  it('accepts Buffer input', async () => {
    const out = await parser.parse(Buffer.from(FIXTURE, 'utf8'), ctx);
    expect(out.findings.length).toBeGreaterThan(0);
  });

  it('returns empty NormalizedOutput for empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.findings).toEqual([]);
  });

  it('does not emit assets, ports, services, technologies, or dnsRecords', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.assets).toEqual([]);
    expect(out.ports).toEqual([]);
    expect(out.services).toEqual([]);
    expect(out.technologies).toEqual([]);
    expect(out.dnsRecords).toEqual([]);
  });

  it('maps unknown severity strings to INFO defensively', async () => {
    const input = JSON.stringify({
      'template-id': 'odd-sev',
      info: { name: 'Weird Severity', severity: 'unknown-level' },
    });
    const out = await parser.parse(input, ctx);
    expect(out.findings.length).toBe(1);
    expect(out.findings[0].severity).toBe('INFO');
  });
});
