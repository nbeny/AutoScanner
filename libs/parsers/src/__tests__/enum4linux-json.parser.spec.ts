import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Enum4LinuxJsonParser } from '../enum4linux-json/enum4linux-json.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'enum4linux-ng',
  target: '10.0.0.5',
  engagementId: 'e',
};

const SAMPLE = readFileSync(join(__dirname, 'fixtures', 'enum4linux-sample.json'), 'utf8');

describe('Enum4LinuxJsonParser', () => {
  const parser = new Enum4LinuxJsonParser();

  it('extracts users and groups as USERNAME identities', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const usernames = out.identities.filter((i) => i.kind === 'USERNAME').map((i) => i.service);
    expect(usernames).toEqual(expect.arrayContaining(['alice', 'bob']));
  });

  it('emits shares as Assets', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const shareValues = out.assets.map((a) => a.value);
    expect(shareValues).toEqual(expect.arrayContaining(['10.0.0.5\\PUBLIC', '10.0.0.5\\C$']));
  });

  it('emits a HIGH finding when null session is allowed', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    expect(out.findings.some((f) => f.severity === 'HIGH' && /null session/i.test(f.title))).toBe(
      true,
    );
  });

  it('emits a MEDIUM finding when password policy min_length < 8', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    expect(
      out.findings.some((f) => f.severity === 'MEDIUM' && /password policy/i.test(f.title)),
    ).toBe(true);
  });

  it('emits a MEDIUM finding for anonymously-readable share', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    expect(
      out.findings.some(
        (f) =>
          f.severity === 'MEDIUM' && /anonymous share/i.test(f.title) && /PUBLIC/.test(f.title),
      ),
    ).toBe(true);
  });

  it('returns empty on blank input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.identities).toHaveLength(0);
  });
});
