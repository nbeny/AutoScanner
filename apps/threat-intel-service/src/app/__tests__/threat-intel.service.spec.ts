import { ThreatIntelService } from '../threat-intel.service';
import type { ThreatIntelSource, ThreatSignal } from '../sources/threat-intel-source';

function source(name: string, signals: ThreatSignal[]): ThreatIntelSource {
  return { name, lookup: jest.fn().mockResolvedValue(signals) };
}

function harness(sources: ThreatIntelSource[]) {
  const upsert = jest.fn().mockResolvedValue({});
  const prisma = { threatIntel: { upsert, findMany: jest.fn() } };
  return { svc: new ThreatIntelService(prisma as never, sources), upsert };
}

const kevSignal: ThreatSignal = {
  indicator: 'CVE-2021-44228',
  kind: 'ACTIVE_EXPLOITATION',
  source: 'cisa-kev',
  severity: 'CRITICAL',
  payload: { catalog: 'CISA KEV' },
};

const event = {
  engagementId: 'eng_1',
  findingId: 'f1',
  cveId: 'CVE-2021-44228',
  assetId: 'a1',
};

describe('ThreatIntelService.enrich', () => {
  it('upserts one ThreatIntel row per signal and returns the count', async () => {
    const { svc, upsert } = harness([source('cisa-kev', [kevSignal])]);

    const res = await svc.enrich(event);

    expect(res).toEqual({ signals: 1 });
    const arg = upsert.mock.calls[0][0];
    expect(arg.where.engagementId_indicator_source_kind).toEqual({
      engagementId: 'eng_1',
      indicator: 'CVE-2021-44228',
      source: 'cisa-kev',
      kind: 'ACTIVE_EXPLOITATION',
    });
    expect(arg.create).toMatchObject({
      engagementId: 'eng_1',
      findingId: 'f1',
      severity: 'CRITICAL',
    });
  });

  it('runs every source and aggregates their signals', async () => {
    const other: ThreatSignal = { ...kevSignal, source: 'other', kind: 'KEV' };
    const { svc, upsert } = harness([source('cisa-kev', [kevSignal]), source('other', [other])]);

    const res = await svc.enrich(event);

    expect(res.signals).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('keeps going when one source throws', async () => {
    const bad: ThreatIntelSource = {
      name: 'bad',
      lookup: jest.fn().mockRejectedValue(new Error('x')),
    };
    const { svc, upsert } = harness([bad, source('cisa-kev', [kevSignal])]);

    const res = await svc.enrich(event);

    expect(res.signals).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('persists nothing when no source produces a signal', async () => {
    const { svc, upsert } = harness([source('cisa-kev', [])]);

    const res = await svc.enrich(event);

    expect(res).toEqual({ signals: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });
});
