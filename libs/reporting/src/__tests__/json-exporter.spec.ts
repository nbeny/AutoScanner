import { JsonExporter, type ReportContext } from '../json-exporter';

describe('JsonExporter', () => {
  const exporter = new JsonExporter();
  const baseCtx: ReportContext = {
    engagement: { id: 'e-1', name: 'Test' },
    generatedAt: '2026-06-12T14:30:00.000Z',
    scans: [{ id: 's-1' }],
    assets: [],
    findings: [],
  };

  it('produces valid pretty-printed JSON', () => {
    const out = exporter.serialize(baseCtx);
    expect(out.startsWith('{\n')).toBe(true);
    expect(JSON.parse(out).engagement.id).toBe('e-1');
  });

  it('round-trips through JSON.parse', () => {
    const out = exporter.serialize(baseCtx);
    expect(JSON.parse(out)).toEqual({
      assets: [],
      engagement: { id: 'e-1', name: 'Test' },
      findings: [],
      generatedAt: '2026-06-12T14:30:00.000Z',
      scans: [{ id: 's-1' }],
    });
  });

  it('sorts top-level keys for deterministic output', () => {
    const ctx1: ReportContext = {
      generatedAt: 't',
      engagement: {},
      zebra: 1,
      alpha: 1,
    };
    const ctx2: ReportContext = {
      alpha: 1,
      zebra: 1,
      engagement: {},
      generatedAt: 't',
    };
    expect(exporter.serialize(ctx1)).toBe(exporter.serialize(ctx2));
  });
});
