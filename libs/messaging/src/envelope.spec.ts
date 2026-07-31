import { wrap, unwrap } from './envelope';

describe('envelope', () => {
  it('wraps a payload with metadata defaults', () => {
    const env = wrap('security.report.requested', 'report-1', { reportId: 'report-1' });
    expect(env.type).toBe('security.report.requested');
    expect(env.key).toBe('report-1');
    expect(env.attempt).toBe(1);
    expect(env.payload).toEqual({ reportId: 'report-1' });
    expect(typeof env.id).toBe('string');
    expect(env.availableAt).toBeUndefined();
  });

  it('round-trips through JSON', () => {
    const env = wrap('t', 'k', { a: 1 });
    const parsed = unwrap<{ a: number }>(Buffer.from(JSON.stringify(env)));
    expect(parsed.payload.a).toBe(1);
    expect(parsed.type).toBe('t');
  });

  it('unwrap throws on malformed json', () => {
    expect(() => unwrap(Buffer.from('not-json'))).toThrow(/invalid message envelope/i);
  });
});
