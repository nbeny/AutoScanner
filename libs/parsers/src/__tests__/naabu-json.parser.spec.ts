import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NaabuJsonParser } from '../naabu-json/naabu-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'naabu-1.1.1.1.jsonl'), 'utf8');

const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'naabu',
  target: '1.1.1.1',
  engagementId: 'eng_1',
};

describe('NaabuJsonParser', () => {
  const parser = new NaabuJsonParser();

  it('declares name and supported formats', () => {
    expect(parser.name).toBe('naabu-json');
    expect(parser.formats).toEqual(['JSONL']);
  });

  it('emits one IP asset per unique IP (deduplicated)', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const ipAssets = out.assets.filter((a) => a.type === 'IP');
    // 1.1.1.1 appears 3× across rows but should only emit once; 1.0.0.1 once.
    expect(ipAssets.length).toBe(2);
    const values = ipAssets.map((a) => a.value).sort();
    expect(values).toEqual(['1.0.0.1', '1.1.1.1']);
  });

  it('emits a NormalizedPort for every port row', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    // 4 valid port lines (5th is malformed).
    expect(out.ports.length).toBe(4);
  });

  it('NormalizedPort has assetValue=ip, number, OPEN state', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const p80 = out.ports.find((p) => p.number === 80 && p.assetValue === '1.1.1.1');
    expect(p80).toBeDefined();
    expect(p80?.protocol).toBe('TCP');
    expect(p80?.state).toBe('OPEN');

    const p443 = out.ports.find((p) => p.number === 443 && p.assetValue === '1.1.1.1');
    expect(p443).toBeDefined();
    expect(p443?.protocol).toBe('TCP');
    expect(p443?.state).toBe('OPEN');
  });

  it('uppercases protocol (tcp → TCP, udp → UDP)', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.ports.every((p) => p.protocol === 'TCP' || p.protocol === 'UDP')).toBe(true);
    const udp = out.ports.find((p) => p.protocol === 'UDP');
    expect(udp).toBeDefined();
    expect(udp?.number).toBe(53);
  });

  it('lowercases IP values', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    for (const a of out.assets.filter((x) => x.type === 'IP')) {
      expect(a.value).toBe(a.value.toLowerCase());
    }
    for (const p of out.ports) {
      expect(p.assetValue).toBe(p.assetValue.toLowerCase());
    }
  });

  it('does not emit services, technologies, or dnsRecords', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.services).toEqual([]);
    expect(out.technologies).toEqual([]);
    expect(out.dnsRecords).toEqual([]);
  });

  it('skips malformed JSON lines without throwing', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    // Fixture has one malformed trailing line; total ports must still be 4.
    expect(out.ports.length).toBe(4);
  });

  it('skips rows missing ip or port without throwing', async () => {
    const input = [
      '{"port":80,"protocol":"tcp"}',
      '{"ip":"1.1.1.1","protocol":"tcp"}',
      '{"ip":"1.1.1.1","port":80,"protocol":"tcp"}',
    ].join('\n');
    const out = await parser.parse(input, ctx);
    expect(out.ports.length).toBe(1);
    expect(out.ports[0].assetValue).toBe('1.1.1.1');
    expect(out.ports[0].number).toBe(80);
  });

  it('defaults unknown/missing protocol to TCP', async () => {
    const input = '{"ip":"2.2.2.2","port":22}';
    const out = await parser.parse(input, ctx);
    expect(out.ports.length).toBe(1);
    expect(out.ports[0].protocol).toBe('TCP');
  });

  it('rejects non-integer or non-positive port numbers', async () => {
    const input = [
      '{"ip":"1.1.1.1","port":0,"protocol":"tcp"}',
      '{"ip":"1.1.1.1","port":65536,"protocol":"tcp"}',
      '{"ip":"1.1.1.1","port":"80","protocol":"tcp"}',
      '{"ip":"1.1.1.1","port":80,"protocol":"tcp"}',
    ].join('\n');
    const out = await parser.parse(input, ctx);
    expect(out.ports.length).toBe(1);
  });

  it('accepts Buffer input', async () => {
    const out = await parser.parse(Buffer.from(FIXTURE, 'utf8'), ctx);
    expect(out.assets.length).toBeGreaterThan(0);
    expect(out.ports.length).toBeGreaterThan(0);
  });

  it('returns empty NormalizedOutput for empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.assets).toEqual([]);
    expect(out.ports).toEqual([]);
  });
});
