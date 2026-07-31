import { resolveBackend } from './messaging.module';

describe('resolveBackend', () => {
  it('uses global default when no override', () => {
    expect(resolveBackend('security.report.requested', 'bullmq', '')).toBe('bullmq');
  });
  it('applies a per-topic override', () => {
    expect(
      resolveBackend('security.report.requested', 'bullmq', 'security.report.requested=kafka'),
    ).toBe('kafka');
  });
  it('ignores unrelated overrides', () => {
    expect(
      resolveBackend('security.scan.requested', 'bullmq', 'security.report.requested=kafka'),
    ).toBe('bullmq');
  });
  it('handles multiple overrides with whitespace', () => {
    const overrides = ' security.report.requested=kafka , security.nvd.sync.requested=kafka ';
    expect(resolveBackend('security.nvd.sync.requested', 'bullmq', overrides)).toBe('kafka');
    expect(resolveBackend('security.report.requested', 'bullmq', overrides)).toBe('kafka');
    expect(resolveBackend('security.scan.requested', 'bullmq', overrides)).toBe('bullmq');
  });
  it('ignores malformed override entries', () => {
    expect(resolveBackend('security.report.requested', 'kafka', 'garbage,=,x=')).toBe('kafka');
  });
});
